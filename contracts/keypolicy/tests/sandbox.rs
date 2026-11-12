//! Sandbox tests (E3): KeyPolicy as built wasm on a real local chain, with the contracts it calls.
//! Needs `make wasm-dev` (KeyPolicy, `keypolicy-sim` and the test doubles) and `fixtures/`.
//!
//! - what the contract *cannot* do, read from the wasm itself;
//! - the whole key-release path, and every way it is stopped, across real contracts;
//! - the real locked verifier, with a real quote.

#[path = "../../../crates/marginal-core/tests/common/mod.rs"]
mod common;

use anyhow::Result;
use common::{fixture, key_request, valid_log};
use ed25519_dalek::{Signer, SigningKey};
use keypolicy::{ATTESTATION_FEE, NONCE_FEE, PINS_FEE, TICKET_FEE};
use marginal_core::attest::{room_pop_signing_bytes, RegisterRoomRequest, RoomBinding, SimRoom};
use marginal_core::certificate::measurement_hash;
use marginal_core::codec::{from_bytes, sha256, to_bytes};
use marginal_core::json::to_hex;
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, KeyRequest};
use marginal_core::verifier::Collateral;
use marginal_core::RoomClass;
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

fn target_dir() -> String {
    std::env::var("CARGO_TARGET_DIR")
        .unwrap_or_else(|_| format!("{}/../../target", env!("CARGO_MANIFEST_DIR")))
}

fn wasm(name: &str, file: &str) -> Vec<u8> {
    std::fs::read(format!("{}/near/{name}/{file}.wasm", target_dir()))
        .unwrap_or_else(|_| panic!("build first: make wasm-dev ({name}/{file}.wasm)"))
}

fn fee(f: near_sdk::NearToken) -> NearToken {
    NearToken::from_yoctonear(f.as_yoctonear())
}

fn b64(bytes: &[u8]) -> String {
    use near_sdk::base64::Engine;
    near_sdk::base64::engine::general_purpose::STANDARD.encode(bytes)
}

// ---------------------------------------------------------------------------------------------
// What the contract cannot do

/// The host functions the contract may import. Nothing here can deploy code, add or delete a key,
/// delete the account, stake, create an account or transfer funds: the only promise action is a
/// function call. A change that adds an import fails this test and must be reviewed.
const ALLOWED_IMPORTS: [&str; 23] = [
    "attached_deposit",
    "block_index",
    "block_timestamp",
    "current_account_id",
    "ed25519_verify",
    "input",
    "log_utf8",
    "panic_utf8",
    "predecessor_account_id",
    "promise_and",
    "promise_batch_action_function_call_weight",
    "promise_batch_create",
    "promise_batch_then",
    "promise_result",
    "promise_return",
    "random_seed",
    "read_register",
    "register_len",
    "storage_has_key",
    "storage_read",
    "storage_remove",
    "storage_write",
    "value_return",
];

const FORBIDDEN_ACTIONS: [&str; 12] = [
    "promise_batch_action_deploy_contract",
    "promise_batch_action_deploy_global_contract",
    "promise_batch_action_use_global_contract",
    "promise_batch_action_add_key_with_full_access",
    "promise_batch_action_add_key_with_function_call",
    "promise_batch_action_delete_key",
    "promise_batch_action_delete_account",
    "promise_batch_action_create_account",
    "promise_batch_action_stake",
    "promise_batch_action_transfer",
    "promise_batch_action_add_gas_key_with_full_access",
    "promise_batch_action_transfer_to_gas_key",
];

/// The methods KeyPolicy exports. There is no setter, no upgrade, no migration.
const EXPORTS: [&str; 17] = [
    "__contract_abi",
    "audit_head",
    "authorize",
    "config",
    "contract_source_metadata",
    "derive",
    "get_attestation",
    "get_pins",
    "get_ticket",
    "issue_nonce",
    "memory",
    "new",
    "on_authorized",
    "on_derived",
    "on_quote_verified",
    "register_room",
    "set_pins",
];

fn module_imports_and_exports(wasm: &[u8]) -> (Vec<String>, Vec<String>) {
    use wasmparser::{Parser, Payload};
    let (mut imports, mut exports) = (vec![], vec![]);
    for payload in Parser::new(0).parse_all(wasm) {
        match payload.unwrap() {
            Payload::ImportSection(section) => {
                imports.extend(section.into_iter().map(|i| i.unwrap().name.to_string()))
            }
            Payload::ExportSection(section) => {
                exports.extend(section.into_iter().map(|e| e.unwrap().name.to_string()))
            }
            _ => {}
        }
    }
    imports.sort();
    exports.sort();
    (imports, exports)
}

#[test]
fn the_built_contract_cannot_change_itself_or_move_funds() {
    let (imports, exports) = module_imports_and_exports(&wasm("keypolicy", "keypolicy"));
    for forbidden in FORBIDDEN_ACTIONS {
        assert!(
            !imports.iter().any(|i| i == forbidden),
            "KeyPolicy imports {forbidden}: it could deploy, change keys, stake or pay"
        );
    }
    let extra: Vec<_> = imports
        .iter()
        .filter(|i| !ALLOWED_IMPORTS.contains(&i.as_str()))
        .collect();
    assert!(
        extra.is_empty(),
        "new host imports need review, then an entry in ALLOWED_IMPORTS: {extra:?}"
    );
    assert_eq!(exports, EXPORTS, "KeyPolicy's methods changed");
    assert!(
        imports.contains(&"promise_batch_action_function_call_weight".to_string()),
        "the one action it has"
    );
}

#[test]
fn the_sim_build_differs_by_exactly_one_method_and_the_same_imports() {
    let (imports, exports) = module_imports_and_exports(&wasm("keypolicy-sim", "keypolicy"));
    let mut expected: Vec<&str> = EXPORTS.to_vec();
    expected.push("register_room_simulated");
    expected.sort();
    assert_eq!(exports, expected);
    assert!(
        imports
            .iter()
            .all(|i| ALLOWED_IMPORTS.contains(&i.as_str())),
        "same capabilities as the real build"
    );
    // The real build has no way to register a room without a quote.
    assert!(!module_imports_and_exports(&wasm("keypolicy", "keypolicy"))
        .1
        .contains(&"register_room_simulated".to_string()));
}

// ---------------------------------------------------------------------------------------------
// A chain with KeyPolicy and its neighbours

struct World {
    worker: Worker<Sandbox>,
    kp: Contract,
    mocks: Contract,
    operator: Account,
    seller: Account,
}

async fn subaccount(root: &Account, name: &str) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(50))
        .transact()
        .await?
        .into_result()?)
}

/// KeyPolicy (`keypolicy_wasm` is the real build or `keypolicy-sim`) wired to one mock account that
/// plays the registry, clearing and the MPC network. The verifier is `verifier` (a mock unless a test
/// deploys the real one there).
async fn world(keypolicy_dir: &str, verifier_wasm: Option<Vec<u8>>) -> Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let mocks = subaccount(&root, "mocks")
        .await?
        .deploy(&wasm("mocks", "mocks"))
        .await?
        .into_result()?;
    let verifier = match verifier_wasm {
        Some(code) => subaccount(&root, "verifier")
            .await?
            .deploy(&code)
            .await?
            .into_result()?,
        None => mocks.clone(),
    };
    let kp = subaccount(&root, "keypolicy")
        .await?
        .deploy(&wasm(keypolicy_dir, "keypolicy"))
        .await?
        .into_result()?;
    kp.call("new")
        .args_json(json!({
            "chain_id": "sandbox",
            "registry": mocks.id(),
            "clearing": mocks.id(),
            "mpc": mocks.id(),
            "ckd_domain_id": 2,
            "dcap_verifier": verifier.id(),
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(World {
        operator: subaccount(&root, "operator").await?,
        seller: subaccount(&root, "seller").await?,
        worker,
        kp,
        mocks,
    })
}

async fn call(
    who: &Account,
    to: &Contract,
    method: &str,
    args: Value,
    deposit: NearToken,
) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(to.id(), method)
        .args_json(args)
        .deposit(deposit)
        .gas(Gas::from_tgas(300))
        .transact()
        .await?)
}

/// Every failure message of a transaction and its receipts.
fn failures(result: &ExecutionFinalResult) -> String {
    result
        .failures()
        .iter()
        .map(|outcome| format!("{outcome:?}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn assert_refused(result: &ExecutionFinalResult, code: &str) {
    assert!(
        result.is_failure(),
        "expected {code}, but the call succeeded"
    );
    assert!(
        failures(result).contains(code),
        "expected {code} in:\n{}",
        failures(result)
    );
}

fn room_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

fn room_key() -> [u8; 32] {
    room_signing_key().verifying_key().to_bytes()
}

async fn view_strings(contract: &Contract, method: &str) -> Result<Vec<Value>> {
    let raw: Vec<String> = contract.view(method).await?.json()?;
    Ok(raw
        .iter()
        .map(|s| serde_json::from_str(s).unwrap())
        .collect())
}

/// Registers the sample room through `register_room_simulated`.
async fn register_sim_room(w: &World) -> Result<()> {
    let nonce: String = call(&w.operator, &w.kp, "issue_nonce", json!({}), fee(NONCE_FEE))
        .await?
        .json()?;
    let room = SimRoom {
        sign_pk: room_key(),
        box_pk: [2; 32],
        nonce: hex::decode(nonce)?.try_into().unwrap(),
        class: RoomClass::K,
        measurement: common::measurement(false),
        ppid_hash: [0x77; 32],
    };
    let result = call(
        &w.operator,
        &w.kp,
        "register_room_simulated",
        json!({"request": b64(&to_bytes(&room))}),
        fee(ATTESTATION_FEE),
    )
    .await?;
    assert!(result.is_success(), "{}", failures(&result));
    Ok(())
}

fn request_for(w: &World, listing: u64, version: u32) -> KeyRequest {
    KeyRequest {
        chain_id: "sandbox".into(),
        keypolicy: w.kp.id().to_string(),
        room_key: room_key(),
        path: listing_path(&w.seller.id().to_string(), listing, version),
        ..key_request()
    }
}

async fn authorize(w: &World, request: &KeyRequest) -> Result<ExecutionFinalResult> {
    let signature = room_signing_key()
        .sign(&key_request_signing_bytes(request))
        .to_bytes();
    call(
        &w.operator,
        &w.kp,
        "authorize",
        json!({"request": b64(&to_bytes(request)), "room_sig": b64(&signature)}),
        fee(TICKET_FEE),
    )
    .await
}

async fn pin_the_room(w: &World, listing: u64, version: u32) -> Result<()> {
    let hash = to_hex(&measurement_hash(&common::measurement(false)));
    let result = call(
        &w.seller,
        &w.kp,
        "set_pins",
        json!({"listing_id": listing.to_string(), "version": version, "pins": [hash]}),
        fee(PINS_FEE),
    )
    .await?;
    assert!(result.is_success(), "{}", failures(&result));
    Ok(())
}

// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn init_happens_once_and_fixes_the_configuration() -> Result<()> {
    let w = world("keypolicy", None).await?;
    let config: Value = w.kp.view("config").await?.json()?;
    assert_eq!(config["chain_id"], "sandbox");
    assert_eq!(config["registry"], w.mocks.id().as_str());
    assert_eq!(config["ckd_domain_id"], 2);
    assert_eq!(config["ticket_ttl_blocks"], 50);

    // Anyone, including the contract itself, calling `new` again changes nothing.
    for caller in [&w.operator, w.kp.as_account()] {
        let again = caller
            .call(w.kp.id(), "new")
            .args_json(json!({"chain_id": "evil", "registry": "a.test", "clearing": "a.test", "mpc": "a.test", "ckd_domain_id": 0, "dcap_verifier": "a.test"}))
            .transact()
            .await?;
        assert!(again.is_failure());
    }
    let after: Value = w.kp.view("config").await?.json()?;
    assert_eq!(after, config);
    Ok(())
}

#[tokio::test]
async fn the_whole_key_release_path_across_real_contracts() -> Result<()> {
    let w = world("keypolicy-sim", None).await?;
    register_sim_room(&w).await?;

    // The registry was asked to admit the room, as a simulated one.
    let admitted = view_strings(&w.mocks, "admitted").await?;
    assert_eq!(admitted.len(), 1);
    assert_eq!(admitted[0]["room_key"], to_hex(&room_key()));
    assert_eq!(admitted[0]["attestation_mode"], "Simulated");

    pin_the_room(&w, 3, 1).await?;
    let request = request_for(&w, 3, 1);
    let ticket = authorize(&w, &request).await?;
    assert!(ticket.is_success(), "{}", failures(&ticket));
    assert_eq!(ticket.json::<String>()?, "1", "the ticket id");

    // Clearing was asked, with the path hash and the commitment the room signed.
    let releases = view_strings(&w.mocks, "releases").await?;
    assert_eq!(releases.len(), 1);
    assert_eq!(releases[0]["job_id"], 11);
    assert_eq!(
        releases[0]["job_commitment"],
        to_hex(&request.job_commitment)
    );
    assert_eq!(
        releases[0]["path_hash"],
        to_hex(&marginal_core::keyrelease::path_hash(&request.path))
    );
    assert_eq!(releases[0]["value_class"], "M");

    // Spending the ticket asks the MPC network for exactly that path, with the room's app key.
    let derived = call(
        &w.operator,
        &w.kp,
        "derive",
        json!({"ticket_id": "1"}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert!(derived.is_success(), "{}", failures(&derived));
    let answer: Value = derived.json()?;
    assert_eq!(
        answer,
        json!({"big_y": "bls12381g1:Yfixed", "big_c": "bls12381g1:Cfixed"})
    );
    let asked = view_strings(&w.mocks, "mpc_requests").await?;
    assert_eq!(asked[0]["derivation_path"], request.path.as_str());
    assert_eq!(asked[0]["domain_id"], 2);
    assert!(asked[0]["app_public_key"]["AppPublicKeyPV"]["pk1"]
        .as_str()
        .unwrap()
        .starts_with("bls12381g1:"));

    // The ticket is spent, and cannot be spent again.
    let ticket: Value =
        w.kp.view("get_ticket")
            .args_json(json!({"ticket_id": "1"}))
            .await?
            .json()?;
    assert_eq!(ticket["used"], true);
    assert_refused(
        &call(
            &w.operator,
            &w.kp,
            "derive",
            json!({"ticket_id": "1"}),
            NearToken::from_yoctonear(0),
        )
        .await?,
        "E_TICKET",
    );

    // Four events, each extending the chain whose head the contract reports.
    let head: Value = w.kp.view("audit_head").await?.json()?;
    assert_eq!(head["seq"], 4);
    Ok(())
}

#[tokio::test]
async fn every_way_the_path_is_stopped_on_chain() -> Result<()> {
    let w = world("keypolicy-sim", None).await?;
    register_sim_room(&w).await?;

    // No pins: no key.
    assert_refused(
        &authorize(&w, &request_for(&w, 3, 1)).await?,
        "E_NOT_PINNED",
    );
    pin_the_room(&w, 3, 1).await?;
    // Pinned for version 1 only.
    assert_refused(
        &authorize(&w, &request_for(&w, 3, 2)).await?,
        "E_NOT_PINNED",
    );

    // The registry no longer admits the room.
    let key = to_hex(&room_key());
    call(
        &w.operator,
        &w.mocks,
        "set_room_ok",
        json!({"room_key": key, "ok": false}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let revoked = authorize(&w, &request_for(&w, 3, 1)).await?;
    assert_refused(&revoked, "E_ROOM_REVOKED");
    call(
        &w.operator,
        &w.mocks,
        "set_room_ok",
        json!({"room_key": key, "ok": true}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    // Clearing says the job does not match the commitment the room signed.
    call(
        &w.operator,
        &w.mocks,
        "set_expected_commitment",
        json!({"commitment": "00".repeat(32)}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let mismatch = authorize(&w, &request_for(&w, 3, 1)).await?;
    assert_refused(&mismatch, "E_RELEASE_DENIED");
    assert!(
        failures(&mismatch).contains("E_COMMITMENT_MISMATCH"),
        "clearing's own reason is in the receipts too"
    );
    call(
        &w.operator,
        &w.mocks,
        "set_expected_commitment",
        json!({"commitment": null}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    // A room asking for another chain's signature, or with a forged one.
    let wrong_chain = KeyRequest {
        chain_id: "mainnet".into(),
        ..request_for(&w, 3, 1)
    };
    assert_refused(&authorize(&w, &wrong_chain).await?, "E_BINDING");
    let request = request_for(&w, 3, 1);
    let forged = SigningKey::from_bytes(&[9; 32])
        .sign(&key_request_signing_bytes(&request))
        .to_bytes();
    let result = call(
        &w.operator,
        &w.kp,
        "authorize",
        json!({"request": b64(&to_bytes(&request)), "room_sig": b64(&forged)}),
        fee(TICKET_FEE),
    )
    .await?;
    assert_refused(&result, "E_BAD_SIGNATURE");

    // None of that created a ticket, and the room can still get one.
    assert!(w
        .kp
        .view("get_ticket")
        .args_json(json!({"ticket_id": "1"}))
        .await?
        .json::<Value>()?
        .is_null());
    let ok = authorize(&w, &request_for(&w, 3, 1)).await?;
    assert!(ok.is_success(), "{}", failures(&ok));
    Ok(())
}

#[tokio::test]
async fn a_failed_mpc_request_keeps_the_ticket_until_it_expires() -> Result<()> {
    let w = world("keypolicy-sim", None).await?;
    register_sim_room(&w).await?;
    pin_the_room(&w, 3, 1).await?;
    authorize(&w, &request_for(&w, 3, 1)).await?.into_result()?;

    call(
        &w.operator,
        &w.mocks,
        "set_mpc_down",
        json!({"down": true}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let down = call(
        &w.operator,
        &w.kp,
        "derive",
        json!({"ticket_id": "1"}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert_refused(&down, "E_DERIVE_FAILED");
    let ticket: Value =
        w.kp.view("get_ticket")
            .args_json(json!({"ticket_id": "1"}))
            .await?
            .json()?;
    assert_eq!(
        ticket["used"], false,
        "an MPC outage does not burn the ticket"
    );

    call(
        &w.operator,
        &w.mocks,
        "set_mpc_down",
        json!({"down": false}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let retry = call(
        &w.operator,
        &w.kp,
        "derive",
        json!({"ticket_id": "1"}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert!(retry.is_success(), "{}", failures(&retry));

    // A second ticket that nobody spends in time.
    authorize(&w, &request_for(&w, 3, 1)).await?.into_result()?;
    w.worker.fast_forward(80).await?;
    assert_refused(
        &call(
            &w.operator,
            &w.kp,
            "derive",
            json!({"ticket_id": "2"}),
            NearToken::from_yoctonear(0),
        )
        .await?,
        "E_TICKET",
    );
    Ok(())
}

#[tokio::test]
async fn every_record_must_be_paid_for() -> Result<()> {
    let w = world("keypolicy-sim", None).await?;
    let short = |f: near_sdk::NearToken| NearToken::from_yoctonear(f.as_yoctonear() - 1);
    assert_refused(
        &call(
            &w.operator,
            &w.kp,
            "issue_nonce",
            json!({}),
            short(NONCE_FEE),
        )
        .await?,
        "E_DEPOSIT",
    );
    assert_refused(
        &call(
            &w.seller,
            &w.kp,
            "set_pins",
            json!({"listing_id": "1", "version": 1, "pins": null}),
            short(PINS_FEE),
        )
        .await?,
        "E_DEPOSIT",
    );
    assert_refused(
        &call(
            &w.operator,
            &w.kp,
            "register_room_simulated",
            json!({"request": ""}),
            short(ATTESTATION_FEE),
        )
        .await?,
        "E_DEPOSIT",
    );
    assert_refused(
        &call(
            &w.operator,
            &w.kp,
            "authorize",
            json!({"request": "", "room_sig": ""}),
            short(TICKET_FEE),
        )
        .await?,
        "E_DEPOSIT",
    );
    Ok(())
}

async fn register(
    w: &World,
    from: &Account,
    request: &RegisterRoomRequest,
) -> Result<ExecutionFinalResult> {
    call(
        from,
        &w.kp,
        "register_room",
        json!({"request": b64(&to_bytes(request))}),
        fee(ATTESTATION_FEE),
    )
    .await
}

/// A nonce belongs to the account that asked for it, and a registration must prove the signing key
/// is held: both checked on the built wasm, with real receipts, before any verifier is called.
#[tokio::test]
async fn a_nonce_is_bound_to_its_issuer_and_the_key_must_be_proved() -> Result<()> {
    let w = world("keypolicy-sim", None).await?;
    let nonce: String = call(&w.operator, &w.kp, "issue_nonce", json!({}), fee(NONCE_FEE))
        .await?
        .json()?;
    let nonce: [u8; 32] = hex::decode(nonce)?.try_into().unwrap();
    let signed = |key: &SigningKey| {
        let mut request = RegisterRoomRequest {
            quote: vec![1],
            collateral: Collateral {
                tcb_info: String::new(),
                qe_identity: String::new(),
                tcb_info_issuer_chain: String::new(),
                qe_identity_issuer_chain: String::new(),
                root_ca_crl: vec![],
                pck_crl: vec![],
                pck_crl_issuer_chain: String::new(),
                pck_certificate_chain: None,
                tcb_info_signature: vec![],
                qe_identity_signature: vec![],
            },
            events: valid_log(),
            sign_pk: key.verifying_key().to_bytes(),
            box_pk: [2; 32],
            nonce,
            class: RoomClass::K,
            sign_sig: [0; 64],
        };
        let binding = RoomBinding {
            chain_id: "sandbox".into(),
            keypolicy: w.kp.id().to_string(),
            sign_pk: request.sign_pk,
            box_pk: request.box_pk,
            nonce,
        };
        request.sign_sig = key.sign(&room_pop_signing_bytes(&binding)).to_bytes();
        request
    };

    // Someone else cannot spend the operator's nonce.
    assert_refused(
        &register(&w, &w.seller, &signed(&room_signing_key())).await?,
        "E_NONCE",
    );
    // A registration that does not hold the key it names is refused, and spends nothing.
    let mut forged = signed(&room_signing_key());
    forged.sign_sig = signed(&SigningKey::from_bytes(&[9; 32])).sign_sig;
    assert_refused(
        &register(&w, &w.operator, &forged).await?,
        "E_BAD_SIGNATURE",
    );
    // The refused attempts did not use the nonce up: the operator's own signed request gets as far
    // as the verifier, whose reply here is empty (the test double was never given one)...
    let request = signed(&room_signing_key());
    assert_refused(&register(&w, &w.operator, &request).await?, "E_DECODE");
    // ...and that attempt did spend it.
    assert_refused(&register(&w, &w.operator, &request).await?, "E_NONCE");
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The real verifier

/// KeyPolicy against the REAL locked verifier contract (the exact wasm of
/// `tee-verifier-2026-11-02.testnet`) and a REAL TDX quote. The quote is from near/mpc's node, so it
/// is not bound to our registration: KeyPolicy must get a real `Verified` answer from the real
/// verifier, decode it, and refuse at the report-data check. That exercises the real argument layout,
/// the real reply layout, and the gas budget, which no mock can. After the collateral in the fixture
/// expires (2026-12-11) the verifier rejects the quote instead, and the test expects that.
#[tokio::test]
async fn the_real_verifier_with_a_real_quote() -> Result<()> {
    let verifier_wasm = std::fs::read(fixture("tee-verifier.wasm"))?;
    let code_hash = near_sdk::bs58::encode(sha256(&[&verifier_wasm])).into_string();
    assert_eq!(
        code_hash, "8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3",
        "the verifier NEAR One locked"
    );

    let w = world("keypolicy", Some(verifier_wasm)).await?;
    let args = std::fs::read(fixture("tee-verifier-fresh-args.borsh"))?;
    let quote_len = u32::from_le_bytes(args[..4].try_into()?) as usize;
    let quote = args[4..4 + quote_len].to_vec();
    let collateral: Collateral = from_bytes(&args[4 + quote_len..]).unwrap();

    let nonce: String = call(&w.operator, &w.kp, "issue_nonce", json!({}), fee(NONCE_FEE))
        .await?
        .json()?;
    let mut request = RegisterRoomRequest {
        quote,
        collateral,
        events: valid_log(),
        sign_pk: room_key(),
        box_pk: [2; 32],
        nonce: hex::decode(nonce)?.try_into().unwrap(),
        class: RoomClass::K,
        sign_sig: [0; 64],
    };
    let binding = RoomBinding {
        chain_id: "sandbox".into(),
        keypolicy: w.kp.id().to_string(),
        sign_pk: request.sign_pk,
        box_pk: request.box_pk,
        nonce: request.nonce,
    };
    request.sign_sig = room_signing_key()
        .sign(&room_pop_signing_bytes(&binding))
        .to_bytes();
    let result = call(
        &w.operator,
        &w.kp,
        "register_room",
        json!({"request": b64(&to_bytes(&request))}),
        fee(ATTESTATION_FEE),
    )
    .await?;

    let now_secs = w.worker.view_block().await?.timestamp() / 1_000_000_000;
    let collateral_expires = 1_797_033_011;
    let expected = if now_secs < collateral_expires {
        "E_REPORT_DATA"
    } else {
        "E_QUOTE_SIG"
    };
    assert_refused(&result, expected);

    // The verifier's own cost, against the 200 TGas it is given.
    let verifier_gas = result
        .outcomes()
        .iter()
        .filter(|o| o.executor_id.as_str().starts_with("verifier."))
        .map(|o| o.gas_burnt.as_gas())
        .max()
        .expect("the verifier ran");
    eprintln!(
        "real verifier burnt {} TGas of the 200 it is given; the whole call burnt {} TGas",
        verifier_gas / 10u64.pow(12),
        result.total_gas_burnt.as_gas() / 10u64.pow(12)
    );
    assert!(
        verifier_gas < Gas::from_tgas(180).as_gas(),
        "at most 90% of the verifier's budget (near/mpc's own guard)"
    );
    assert!(
        w.kp.view("get_attestation")
            .args_json(json!({"room_key": to_hex(&room_key())}))
            .await?
            .json::<Value>()?
            .is_null(),
        "nothing stored"
    );
    Ok(())
}
