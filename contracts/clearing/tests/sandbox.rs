//! Sandbox tests (E4): clearing as built wasm on a real local chain, with the real KeyPolicy.
//! Needs `make wasm-dev`.
//!
//! What only a real chain can show: that KeyPolicy's `admit_room` call reaches the registry inside
//! the real clearing and fits in the 15 TGas KeyPolicy gives it, and that the whole listing path
//! works on the built wasm with real signatures, storage and gas.

#[path = "../../../crates/marginal-core/tests/common/mod.rs"]
mod common;

use anyhow::Result;
use common::{measurement, spec};
use ed25519_dalek::{Signer, SigningKey};
use marginal_core::attest::{ppid_hash, SimRoom};
use marginal_core::certificate::measurement_hash;
use marginal_core::codec::to_bytes;
use marginal_core::json::to_hex;
use marginal_core::judge::personal_sign_preimage;
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, AppKey, KeyRequest};
use marginal_core::listing::PublishSpec;
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1, FLAG_MNPI,
};
use marginal_core::request::AppraisalRequest;
use marginal_core::verdict::{
    verdict_signing_bytes, JudgeFactor, ModelProof, OpenBody, VerdictStatus, VerdictV1,
};
use marginal_core::{
    BlobRef, DisplayMode, PayoutRoute, RefundRoute, RoomClass, ValueClass, VerdictPrivacy,
};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

use clearing::{MeasurementSet, LISTING_FEE, PLATFORM_FEE, PUBLISH_FEE, SET_FEE};

fn measurement_set() -> MeasurementSet {
    MeasurementSet {
        id: "knowledge-room@1.0.0".into(),
        members: vec![measurement(false)],
        source_tag: "v0.1.0 abcdef".into(),
    }
}

const CHAIN_ID: &str = "sandbox";
const PPID: [u8; 16] = [0x77; 16];

fn target_dir() -> String {
    std::env::var("CARGO_TARGET_DIR")
        .unwrap_or_else(|_| format!("{}/../../target", env!("CARGO_MANIFEST_DIR")))
}

fn wasm(name: &str, file: &str) -> Vec<u8> {
    let path = format!("{}/near/{name}/{file}.wasm", target_dir());
    std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}; run `make wasm-dev`"))
}

fn fee(f: NearToken) -> NearToken {
    NearToken::from_yoctonear(f.as_yoctonear())
}

fn b64(bytes: &[u8]) -> String {
    use near_sdk::base64::Engine as _;
    near_sdk::base64::engine::general_purpose::STANDARD.encode(bytes)
}

struct World {
    worker: Worker<Sandbox>,
    root: Account,
    clearing: Contract,
    keypolicy: Contract,
    gov: Account,
    seller: Account,
    buyer: Account,
    operator: Account,
}

async fn subaccount(root: &Account, name: &str) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?)
}

/// The real clearing and the `sim-attestation` build of the real KeyPolicy, wired to each other.
async fn world() -> Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let gov = subaccount(&root, "gov").await?;
    let clearing = subaccount(&root, "clearing")
        .await?
        .deploy(&wasm("clearing", "clearing"))
        .await?
        .into_result()?;
    let keypolicy = subaccount(&root, "keypolicy")
        .await?
        .deploy(&wasm("keypolicy-sim", "keypolicy"))
        .await?
        .into_result()?;

    clearing
        .call("new")
        .args_json(json!({
            "gov": gov.id(),
            "keypolicy": keypolicy.id(),
            "chain_id": CHAIN_ID,
            "tokens": ["musdc.marginal-demo.testnet"],
            "profile": {
                "profile": "sandbox",
                "gov_profile": "demo",
                "cooling_blocks": 0,
                // The sandbox clock advances about 0.3 s a block, so a ten-minute window would
                // cost thousands of blocks to wait out. The window's length is a profile value,
                // and what the test needs to exercise is that it is enforced at all.
                "challenge_window_secs": 5,
                "rules_enabled": ["R1"],
                "asset_classes_enabled": ["Knowledge", "Dataset"],
            },
        }))
        .transact()
        .await?
        .into_result()?;
    keypolicy
        .call("new")
        .args_json(json!({
            "chain_id": CHAIN_ID,
            "registry": clearing.id(),
            "clearing": clearing.id(),
            "mpc": "mpc.test.near",
            "ckd_domain_id": 2,
            "dcap_verifier": "verifier.test.near",
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(World {
        seller: subaccount(&root, "seller").await?,
        buyer: subaccount(&root, "buyer").await?,
        operator: subaccount(&root, "operator").await?,
        worker,
        root,
        clearing,
        keypolicy,
        gov,
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

fn failures(result: &ExecutionFinalResult) -> String {
    result
        .failures()
        .iter()
        .map(|f| format!("{f:?}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn assert_refused(result: &ExecutionFinalResult, code: &str) {
    assert!(result.is_failure(), "expected {code}, but it succeeded");
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

fn sign(message: &[u8]) -> String {
    b64(&room_signing_key().sign(message).to_bytes())
}

/// Governance approves the room's software and its platform.
async fn seed_policy(w: &World) -> Result<()> {
    // The set crosses the interface as Borsh, like every argument that carries core's types.
    let set_bytes = near_sdk::borsh::to_vec(&measurement_set())?;
    call(
        &w.gov,
        &w.clearing,
        "approve_measurement_set",
        json!({ "set": b64(&set_bytes) }),
        fee(SET_FEE),
    )
    .await?
    .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "admit_platform",
        json!({ "ppid": hex::encode(PPID), "operator": w.operator.id(), "cap_per_epoch": "1000" }),
        fee(PLATFORM_FEE),
    )
    .await?
    .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "set_appraiser",
        json!({"id": "knowledge", "version": 1, "formula": "KnowledgeV1", "compute_fee": "10", "enabled": true}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    Ok(())
}

/// The real KeyPolicy admits the room into the real registry: one cross-contract call, with the
/// gas KeyPolicy actually gives it.
async fn register_room(w: &World) -> Result<ExecutionFinalResult> {
    let nonce: String = call(
        &w.operator,
        &w.keypolicy,
        "issue_nonce",
        json!({}),
        fee(keypolicy::NONCE_FEE),
    )
    .await?
    .json()?;
    let room = SimRoom {
        sign_pk: room_key(),
        box_pk: [2; 32],
        nonce: hex::decode(nonce)?.try_into().unwrap(),
        class: RoomClass::Kcpu,
        measurement: measurement(false),
        ppid_hash: ppid_hash(&PPID),
    };
    call(
        &w.operator,
        &w.keypolicy,
        "register_room_simulated",
        json!({ "request": b64(&to_bytes(&room)) }),
        fee(keypolicy::ATTESTATION_FEE),
    )
    .await
}

async fn view(contract: &Contract, method: &str, args: Value) -> Result<Value> {
    Ok(contract.view(method).args_json(args).await?.json()?)
}

/// A listing the seller has taken all the way to `Active`: created, provisioned, published and
/// screened `Pass` by the room.
async fn active_listing(w: &World, token: &str) -> Result<u64> {
    let listing = marginal_core::listing::ListingSpec {
        token: token.to_string(),
        ..spec()
    };
    let listing_id: u64 = call(
        &w.seller,
        &w.clearing,
        "create_listing",
        json!({ "spec": b64(&to_bytes(&listing)) }),
        fee(LISTING_FEE),
    )
    .await?
    .json::<String>()?
    .parse()?;
    let job_id: u64 = call(
        &w.seller,
        &w.clearing,
        "begin_provisioning",
        json!({ "listing_id": listing_id.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json::<String>()?
    .parse()?;
    let report = ProvisioningV1 {
        domain: ProvisioningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        pk_l: [0x5a; 32],
        cert_hash: [0x6b; 32],
    };
    call(
        &w.operator,
        &w.clearing,
        "submit_provisioning",
        json!({"report": b64(&to_bytes(&report)), "sig": sign(&provisioning_signing_bytes(&report))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let publish = PublishSpec {
        good_commitment: [0xab; 32],
        ciphertext: BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 3,
        },
        payout: PayoutRoute::NearAccount(w.seller.id().to_string()),
    };
    let screening_job: u64 = call(
        &w.seller,
        &w.clearing,
        "publish_listing",
        json!({ "listing_id": listing_id.to_string(), "publish": b64(&to_bytes(&publish)) }),
        fee(PUBLISH_FEE),
    )
    .await?
    .json::<String>()?
    .parse()?;
    let screening = ScreeningV1 {
        domain: ScreeningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id: screening_job,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        result: ScreeningResult::Pass,
        cert_hash: [0x7c; 32],
    };
    call(
        &w.operator,
        &w.clearing,
        "submit_screening",
        json!({"report": b64(&to_bytes(&screening)), "sig": sign(&screening_signing_bytes(&screening))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    Ok(listing_id)
}

// ---------------------------------------------------------------------------------------------

/// KeyPolicy verifies, the registry inside clearing applies policy. The call KeyPolicy makes is
/// fixed (its wasm is built), so this is the test that the two halves still fit: the JSON shape of
/// `admit_room`, the KeyPolicy-only check, and the **15 TGas** KeyPolicy attaches to it.
#[tokio::test]
async fn keypolicy_admits_a_room_into_the_registry_within_its_gas_budget() -> Result<()> {
    let w = world().await?;
    seed_policy(&w).await?;

    let result = register_room(&w).await?;
    assert!(result.is_success(), "{}", failures(&result));

    let key = to_hex(&room_key());
    let room = view(&w.clearing, "get_room", json!({ "room_key": key.clone() })).await?;
    assert_eq!(room["measurement_set"], "knowledge-room@1.0.0");
    assert_eq!(room["class"], "Kcpu");
    assert_eq!(room["current"], true);
    assert_eq!(
        view(
            &w.clearing,
            "check_room",
            json!({ "room_key": key.clone() })
        )
        .await?,
        json!({"ok": true, "deny_reasons": []})
    );
    assert_eq!(
        view(&w.clearing, "eligible", json!({"class": "Kcpu"})).await?,
        json!([key])
    );

    // What the registry's half of the call burnt, against the 15 TGas KeyPolicy gives it.
    let admit = result
        .outcomes()
        .iter()
        .filter(|o| o.executor_id.as_str() == w.clearing.id().as_str())
        .map(|o| o.gas_burnt.as_gas())
        .max()
        .expect("clearing ran");
    eprintln!(
        "admit_room burnt {} TGas of the 15 KeyPolicy attaches",
        admit / 10u64.pow(12)
    );
    assert!(
        admit < Gas::from_tgas(15).as_gas(),
        "admit_room must fit in KeyPolicy's ADMIT_GAS"
    );
    Ok(())
}

/// Nobody but KeyPolicy may admit a room, and the registry applies its own policy on top of what
/// KeyPolicy verified.
#[tokio::test]
async fn the_registry_keeps_its_own_policy() -> Result<()> {
    let w = world().await?;

    // Before governance approves anything, the room is refused: KeyPolicy's receipt carries the
    // registry's reason.
    seed_policy_without_platform(&w).await?;
    let refused = register_room(&w).await?;
    assert_refused(&refused, "E_PLATFORM_NOT_ADMITTED");

    call(
        &w.gov,
        &w.clearing,
        "admit_platform",
        json!({ "ppid": hex::encode(PPID), "operator": w.operator.id(), "cap_per_epoch": "1000" }),
        fee(PLATFORM_FEE),
    )
    .await?
    .into_result()?;
    assert!(register_room(&w).await?.is_success());

    // A room nobody admitted is unknown, and only KeyPolicy may admit one.
    assert_eq!(
        view(
            &w.clearing,
            "check_room",
            json!({ "room_key": to_hex(&[9u8; 32]) })
        )
        .await?,
        json!({"ok": false, "deny_reasons": ["unknown"]})
    );
    let direct = call(
        &w.operator,
        &w.clearing,
        "admit_room",
        json!({ "room": {} }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    assert_refused(&direct, "only keypolicy");
    Ok(())
}

async fn seed_policy_without_platform(w: &World) -> Result<()> {
    let set_bytes = near_sdk::borsh::to_vec(&measurement_set())?;
    call(
        &w.gov,
        &w.clearing,
        "approve_measurement_set",
        json!({ "set": b64(&set_bytes) }),
        fee(SET_FEE),
    )
    .await?
    .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "set_appraiser",
        json!({"id": "knowledge", "version": 1, "formula": "KnowledgeV1", "compute_fee": "10", "enabled": true}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    Ok(())
}

/// The whole listing path on the built wasm: create, provision, publish, screen, with the room's
/// real signatures and real storage fees. The audit chain is checked from the views at the end.
#[tokio::test]
async fn the_whole_listing_path_with_a_real_room() -> Result<()> {
    let w = world().await?;
    seed_policy(&w).await?;
    register_room(&w).await?.into_result()?;

    let listing_id: String = call(
        &w.seller,
        &w.clearing,
        "create_listing",
        json!({ "spec": b64(&to_bytes(&spec())) }),
        fee(LISTING_FEE),
    )
    .await?
    .json()?;
    let listing_id: u64 = listing_id.parse()?;

    let job_id: String = call(
        &w.seller,
        &w.clearing,
        "begin_provisioning",
        json!({ "listing_id": listing_id.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    let job_id: u64 = job_id.parse()?;
    let jobs = view(
        &w.clearing,
        "get_jobs_for_room",
        json!({ "room_key": to_hex(&room_key()) }),
    )
    .await?;
    assert_eq!(jobs[0]["id"], job_id, "the room sees its own work");

    let report = ProvisioningV1 {
        domain: ProvisioningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        pk_l: [0x5a; 32],
        cert_hash: [0x6b; 32],
    };
    call(
        &w.operator,
        &w.clearing,
        "submit_provisioning",
        json!({"report": b64(&to_bytes(&report)), "sig": sign(&provisioning_signing_bytes(&report))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    let publish = PublishSpec {
        good_commitment: [0xab; 32],
        ciphertext: BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 3,
        },
        payout: PayoutRoute::NearAccount(w.seller.id().to_string()),
    };
    let screening_job: String = call(
        &w.seller,
        &w.clearing,
        "publish_listing",
        json!({ "listing_id": listing_id.to_string(), "publish": b64(&to_bytes(&publish)) }),
        fee(PUBLISH_FEE),
    )
    .await?
    .json()?;
    let screening_job: u64 = screening_job.parse()?;

    let screening = ScreeningV1 {
        domain: ScreeningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id: screening_job,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        result: ScreeningResult::Pass,
        cert_hash: [0x7c; 32],
    };
    call(
        &w.operator,
        &w.clearing,
        "submit_screening",
        json!({"report": b64(&to_bytes(&screening)), "sig": sign(&screening_signing_bytes(&screening))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    let listing = view(
        &w.clearing,
        "get_listing",
        json!({ "listing_id": listing_id.to_string() }),
    )
    .await?;
    assert_eq!(listing["status"], "Active");
    assert_eq!(listing["pk_l"], to_hex(&[0x5a; 32]));
    assert!(listing["publish_height"].as_u64().unwrap() > 0);
    assert_eq!(
        view(
            &w.clearing,
            "get_jobs_for_room",
            json!({ "room_key": to_hex(&room_key()) })
        )
        .await?,
        json!([]),
        "and the room's queue is clear"
    );

    // The chain the events carry is the chain the contract stores (AC-37, E4.2).
    let head = view(&w.clearing, "audit_head", json!({})).await?;
    let entries = view(&w.clearing, "get_audit", json!({"from": "1", "limit": 100})).await?;
    assert_eq!(
        entries.as_array().unwrap().len() as u64,
        head["seq"].as_u64().unwrap()
    );
    let kinds: Vec<&str> = entries
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["kind"].as_str().unwrap())
        .collect();
    assert_eq!(
        &kinds[kinds.len() - 5..],
        &[
            "ListingCreated",
            "JobAssigned",
            "ListingProvisioned",
            "ListingPublished",
            "ScreeningResult"
        ]
    );
    Ok(())
}

/// A screening room that flags a listing holds it, and a relayer cannot forge the report.
#[tokio::test]
async fn a_flagged_listing_is_held_and_a_report_cannot_be_forged() -> Result<()> {
    let w = world().await?;
    seed_policy(&w).await?;
    register_room(&w).await?.into_result()?;

    let listing_id: u64 = call(
        &w.seller,
        &w.clearing,
        "create_listing",
        json!({ "spec": b64(&to_bytes(&spec())) }),
        fee(LISTING_FEE),
    )
    .await?
    .json::<String>()?
    .parse()?;
    let job_id: u64 = call(
        &w.seller,
        &w.clearing,
        "begin_provisioning",
        json!({ "listing_id": listing_id.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json::<String>()?
    .parse()?;

    let report = ProvisioningV1 {
        domain: ProvisioningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        pk_l: [0x5a; 32],
        cert_hash: [0x6b; 32],
    };
    // Signed by a key that is not the room's.
    let impostor = SigningKey::from_bytes(&[8; 32]);
    let forged = b64(&impostor
        .sign(&provisioning_signing_bytes(&report))
        .to_bytes());
    let refused = call(
        &w.operator,
        &w.clearing,
        "submit_provisioning",
        json!({"report": b64(&to_bytes(&report)), "sig": forged}),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert_refused(&refused, "E_BAD_SIGNATURE");

    call(
        &w.operator,
        &w.clearing,
        "submit_provisioning",
        json!({"report": b64(&to_bytes(&report)), "sig": sign(&provisioning_signing_bytes(&report))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let publish = PublishSpec {
        good_commitment: [0xab; 32],
        ciphertext: BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 3,
        },
        payout: PayoutRoute::NearAccount(w.seller.id().to_string()),
    };
    let screening_job: u64 = call(
        &w.seller,
        &w.clearing,
        "publish_listing",
        json!({ "listing_id": listing_id.to_string(), "publish": b64(&to_bytes(&publish)) }),
        fee(PUBLISH_FEE),
    )
    .await?
    .json::<String>()?
    .parse()?;

    let flag = ScreeningV1 {
        domain: ScreeningV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id: screening_job,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        result: ScreeningResult::Flag { reason: FLAG_MNPI },
        cert_hash: [0x7c; 32],
    };
    call(
        &w.operator,
        &w.clearing,
        "submit_screening",
        json!({"report": b64(&to_bytes(&flag)), "sig": sign(&screening_signing_bytes(&flag))}),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    assert_eq!(
        view(
            &w.clearing,
            "get_listing",
            json!({ "listing_id": listing_id.to_string() })
        )
        .await?["status"],
        "Held"
    );
    assert_eq!(measurement_hash(&measurement(false)).len(), 32);
    assert!(w.worker.view_block().await?.height() > 0);
    Ok(())
}

/// A token the buyer has funded a balance with, and a listing priced in it.
async fn funded_world() -> Result<(World, Contract, u64)> {
    let w = world().await?;
    seed_policy(&w).await?;
    register_room(&w).await?.into_result()?;
    let token = w
        .root
        .create_subaccount("musdc")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?
        .deploy(&wasm("musdc", "musdc"))
        .await?
        .into_result()?;
    token
        .call("new")
        .args_json(json!({ "faucet": w.gov.id() }))
        .transact()
        .await?
        .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "set_tokens",
        json!({ "tokens": [token.id()] }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let listing_id = active_listing(&w, token.id().as_str()).await?;
    call(
        &w.gov,
        &token,
        "mint",
        json!({ "account_id": w.buyer.id(), "amount": "10000000000" }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    call(
        &w.buyer,
        &token,
        "storage_deposit",
        json!({ "account_id": w.clearing.id() }),
        NearToken::from_millinear(10),
    )
    .await?
    .into_result()?;
    call(
        &w.buyer,
        &token,
        "ft_transfer_call",
        json!({
            "receiver_id": w.clearing.id(),
            "amount": "10000000000",
            "msg": json!({"Deposit": {"account": w.buyer.id()}}).to_string(),
        }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .into_result()?;
    Ok((w, token, listing_id))
}

/// The buyer asks for an appraisal of `listing_id`, funded from its balance.
async fn request_appraisal(w: &World, listing_id: u64, budget: u128) -> Result<u64> {
    let request = AppraisalRequest {
        listing_id,
        listing_version: 1,
        snapshot_id: None,
        budget,
        mode: DisplayMode::Blind,
        privacy: VerdictPrivacy::Open,
        n_judges: 2,
        delivery_pk: [0x11; 32],
        compliance_pk: None,
        context_auth_pk: [0x22; 32],
        sealed_context_key: vec![7, 7, 7],
        refund_to: RefundRoute::Balance,
        nullifier: None,
        nullifier_sig: None,
    };
    let answer: Value = call(
        &w.buyer,
        &w.clearing,
        "request_appraisal",
        json!({ "request": b64(&to_bytes(&request)) }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    assert_eq!(answer["status"], "Created", "{answer}");
    Ok(answer["job_id"].as_str().unwrap().parse()?)
}

async fn balance(w: &World, token: &Contract, account: &Account) -> Result<u128> {
    let raw: String = w
        .clearing
        .view("get_balance")
        .args_json(json!({ "account": account.id(), "token": token.id() }))
        .await?
        .json()?;
    Ok(raw.parse()?)
}

/// The whole buyer path on built wasm, ending in a key release the **real** KeyPolicy asks for
/// (E5.5, E5.6). KeyPolicy's wasm is fixed, so this is the test that clearing's `check_room` and
/// `authorize_release` are the two calls it actually makes, with its gas and its 1 yocto.
#[tokio::test]
async fn a_buyer_funds_a_job_and_keypolicy_releases_its_key() -> Result<()> {
    let w = world().await?;
    seed_policy(&w).await?;
    register_room(&w).await?.into_result()?;
    // The buyer gets test dollars and deposits them into clearing (NEP-141, §3.9.3 path 1).
    let token = w
        .root
        .create_subaccount("musdc")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?
        .into_result()?
        .deploy(&wasm("musdc", "musdc"))
        .await?
        .into_result()?;
    token
        .call("new")
        .args_json(json!({ "faucet": w.gov.id() }))
        .transact()
        .await?
        .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "set_tokens",
        json!({ "tokens": [token.id()] }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let listing_id = active_listing(&w, token.id().as_str()).await?;
    call(
        &w.gov,
        &token,
        "mint",
        json!({ "account_id": w.buyer.id(), "amount": "10000000000" }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    call(
        &w.buyer,
        &token,
        "storage_deposit",
        json!({ "account_id": w.clearing.id() }),
        NearToken::from_millinear(10),
    )
    .await?
    .into_result()?;
    call(
        &w.buyer,
        &token,
        "ft_transfer_call",
        json!({
            "receiver_id": w.clearing.id(),
            "amount": "10000000000",
            "msg": json!({"Deposit": {"account": w.buyer.id()}}).to_string(),
        }),
        NearToken::from_yoctonear(1),
    )
    .await?
    .into_result()?;
    let balance: String = w
        .clearing
        .view("get_balance")
        .args_json(json!({ "account": w.buyer.id(), "token": token.id() }))
        .await?
        .json()?;
    assert_eq!(balance, "10000000000", "the deposit landed");

    // The buyer asks for an appraisal, funded from that balance.
    let request = AppraisalRequest {
        listing_id,
        listing_version: 1,
        snapshot_id: None,
        budget: 500_000_000,
        mode: DisplayMode::Blind,
        privacy: VerdictPrivacy::Open,
        n_judges: 2,
        delivery_pk: [0x11; 32],
        compliance_pk: None,
        context_auth_pk: [0x22; 32],
        sealed_context_key: vec![7, 7, 7],
        refund_to: RefundRoute::Balance,
        nullifier: None,
        nullifier_sig: None,
    };
    let answer: Value = call(
        &w.buyer,
        &w.clearing,
        "request_appraisal",
        json!({ "request": b64(&to_bytes(&request)) }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    assert_eq!(answer["status"], "Created", "{answer}");
    let job_id: u64 = answer["job_id"].as_str().unwrap().parse()?;
    let job = view(
        &w.clearing,
        "get_job",
        json!({ "job_id": job_id.to_string() }),
    )
    .await?;
    assert_eq!(job["state"], "Assigned");
    assert_eq!(job["buyer"], w.buyer.id().to_string());

    // The room asks KeyPolicy for the listing key. KeyPolicy checks its own records, then asks
    // clearing: `check_room` and `authorize_release`, both of them the real thing.
    let seller_id = w.seller.id().to_string();
    let key_request = KeyRequest {
        chain_id: CHAIN_ID.into(),
        keypolicy: w.keypolicy.id().to_string(),
        room_key: room_key(),
        job_id,
        path: listing_path(&seller_id, listing_id, 1),
        app_key: AppKey {
            pk1: [5; 48],
            pk2: [6; 96],
        },
        job_commitment: marginal_core::json::parse_hex(job["job_commitment"].as_str().unwrap())
            .unwrap(),
        value_class: ValueClass::M,
    };
    // The seller pins the room's software first, or KeyPolicy refuses the release.
    call(
        &w.seller,
        &w.keypolicy,
        "set_pins",
        json!({
            "listing_id": listing_id.to_string(),
            "version": 1,
            "pins": [to_hex(&measurement_hash(&measurement(false)))],
        }),
        fee(keypolicy::PINS_FEE),
    )
    .await?
    .into_result()?;

    let authorized = call(
        &w.operator,
        &w.keypolicy,
        "authorize",
        json!({
            "request": b64(&to_bytes(&key_request)),
            "room_sig": b64(&room_signing_key().sign(&key_request_signing_bytes(&key_request)).to_bytes()),
        }),
        fee(keypolicy::TICKET_FEE),
    )
    .await?;
    assert!(authorized.is_success(), "{}", failures(&authorized));

    // Clearing moved the job to `Computing` and recorded the release on its own chain.
    let job = view(
        &w.clearing,
        "get_job",
        json!({ "job_id": job_id.to_string() }),
    )
    .await?;
    assert_eq!(job["state"], "Computing");
    let entries = view(&w.clearing, "get_audit", json!({"from": "1", "limit": 100})).await?;
    let kinds: Vec<&str> = entries
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds.last(), Some(&"KeyReleaseAuthorized"));

    // And the context key the buyer sealed is there for the room to collect (§3.12.4).
    let sealed: Option<String> = w
        .clearing
        .view("get_context_key")
        .args_json(json!({ "job_id": job_id.to_string() }))
        .await?
        .json()?;
    assert!(sealed.is_some(), "the room can fetch its context key");
    Ok(())
}

/// DRC-11, on built wasm: the room is killed mid-job, and after the deadline anyone can call
/// `refund_expired` and the buyer is made whole, to the unit.
#[tokio::test]
async fn the_room_is_killed_and_the_buyer_is_made_whole() -> Result<()> {
    let (w, token, listing_id) = funded_world().await?;
    let before = balance(&w, &token, &w.buyer).await?;
    let job_id = request_appraisal(&w, listing_id, 500_000_000).await?;
    let funded = before - balance(&w, &token, &w.buyer).await?;
    assert!(
        funded > 500_000_000,
        "the budget plus the compute fee and the leakage reserve"
    );

    let job = view(
        &w.clearing,
        "get_job",
        json!({ "job_id": job_id.to_string() }),
    )
    .await?;
    let deadline = job["deadline_height"].as_u64().unwrap();

    // Before the deadline, nobody can take the job away from the room.
    let early = call(
        &w.seller,
        &w.clearing,
        "refund_expired",
        json!({ "job_id": job_id.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert_refused(&early, "E_JOB_STATE");

    // The room never answers. Past the deadline, anyone ends the job.
    w.worker
        .fast_forward(deadline + 2 - w.worker.view_block().await?.height())
        .await?;
    let answer: Value = call(
        &w.seller,
        &w.clearing,
        "refund_expired",
        json!({ "job_id": job_id.to_string() }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    assert_eq!(answer["status"], "Timeout");
    assert_eq!(
        balance(&w, &token, &w.buyer).await?,
        before,
        "made whole, to the unit"
    );

    // The leakage reservation is released, so the listing can sell again, and the room's queue is
    // clear.
    let leakage = view(
        &w.clearing,
        "get_leakage",
        json!({ "listing_id": listing_id.to_string() }),
    )
    .await?;
    assert_eq!(leakage["reserved_mbits"], 0);
    assert_eq!(leakage["spent_mbits"], 0);
    assert_eq!(
        view(
            &w.clearing,
            "get_jobs_for_room",
            json!({ "room_key": to_hex(&room_key()) })
        )
        .await?,
        json!([])
    );
    let record = view(
        &w.clearing,
        "get_settlement",
        json!({ "job_id": job_id.to_string() }),
    )
    .await?;
    assert_eq!(record["outcome"], "Timeout");
    assert_eq!(record["refund"], funded.to_string());
    Ok(())
}

/// A deal from end to end on built wasm: the room's verdict is priced by clearing, the good is
/// delivered, the window passes, the seller is paid and claims it as real tokens.
#[tokio::test]
async fn a_deal_is_settled_delivered_released_and_claimed() -> Result<()> {
    let (w, token, listing_id) = funded_world().await?;
    // Governance registers the judge's signer and the compliance key, and sets a fee.
    call(
        &w.gov,
        &w.clearing,
        "set_ai_signer",
        json!({
            "address": to_hex(&judge_address()),
            "model": "Qwen/Qwen3.8-27B",
            "expires_at": now_secs(&w).await? + 3_600,
        }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    call(
        &w.gov,
        &w.clearing,
        "set_compliance_key",
        json!({ "key": to_hex(&compliance_key().verifying_key().to_bytes()) }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    let job_id = request_appraisal(&w, listing_id, 500_000_000).await?;
    // KeyPolicy authorises the release, which is what starts the work.
    let job = view(
        &w.clearing,
        "get_job",
        json!({ "job_id": job_id.to_string() }),
    )
    .await?;
    let seller_id = w.seller.id().to_string();
    let key_request = KeyRequest {
        chain_id: CHAIN_ID.into(),
        keypolicy: w.keypolicy.id().to_string(),
        room_key: room_key(),
        job_id,
        path: listing_path(&seller_id, listing_id, 1),
        app_key: AppKey {
            pk1: [5; 48],
            pk2: [6; 96],
        },
        job_commitment: marginal_core::json::parse_hex(job["job_commitment"].as_str().unwrap())
            .unwrap(),
        value_class: ValueClass::M,
    };
    call(
        &w.seller,
        &w.keypolicy,
        "set_pins",
        json!({
            "listing_id": listing_id.to_string(),
            "version": 1,
            "pins": [to_hex(&measurement_hash(&measurement(false)))],
        }),
        fee(keypolicy::PINS_FEE),
    )
    .await?
    .into_result()?;
    call(
        &w.operator,
        &w.keypolicy,
        "authorize",
        json!({
            "request": b64(&to_bytes(&key_request)),
            "room_sig": b64(&room_signing_key().sign(&key_request_signing_bytes(&key_request)).to_bytes()),
        }),
        fee(keypolicy::TICKET_FEE),
    )
    .await?
    .into_result()?;

    // The room reports a verdict with two real judge receipts.
    let verdict = verdict_for(&w, job_id, listing_id, &job);
    let settled: Value = call(
        &w.operator,
        &w.clearing,
        "submit_verdict",
        json!({
            "verdict": b64(&to_bytes(&verdict)),
            "sig": b64(&room_signing_key().sign(&verdict_signing_bytes(&verdict)).to_bytes()),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    assert_eq!(settled["status"], "Settled", "{settled}");
    assert_eq!(settled["outcome"], "Deal");
    assert_eq!(settled["price"], "400000000", "the listing's ask");

    // The good is delivered, and the window has to pass before the seller is paid.
    call(
        &w.operator,
        &w.clearing,
        "submit_delivery_receipt",
        json!({ "job_id": job_id.to_string(), "delivery_hash": to_hex(&[0xd1; 32]) }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;
    let approval = marginal_core::credential::PayoutApproval {
        domain: marginal_core::credential::PayoutApproval::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        subject: seller_id.clone(),
        route_hash: marginal_core::codec::hash_of(&PayoutRoute::NearAccount(seller_id.clone())),
        list_version: [0x11; 32],
        screening_id: [0x22; 32],
        blocked: false,
        expiry_height: w.worker.view_block().await?.height() + 1_000,
    };
    let approval_args = json!({
        "job_id": job_id.to_string(),
        "approval": b64(&to_bytes(&approval)),
        "sig": b64(&compliance_key()
            .sign(&marginal_core::credential::payout_approval_signing_bytes(&approval))
            .to_bytes()),
    });
    let early = call(
        &w.buyer,
        &w.clearing,
        "release_held",
        approval_args.clone(),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert_refused(&early, "E_JOB_STATE");

    // The sandbox's clock follows its blocks, so ten minutes is about 600 blocks.
    // Wait the window out: about 0.3 s a block in the sandbox.
    w.worker.fast_forward(40).await?;
    let released: Value = call(
        &w.buyer,
        &w.clearing,
        "release_held",
        approval_args,
        NearToken::from_yoctonear(0),
    )
    .await?
    .json()?;
    assert_eq!(released["status"], "Released");
    assert_eq!(
        view(
            &w.clearing,
            "get_job",
            json!({ "job_id": job_id.to_string() })
        )
        .await?["state"],
        "Final"
    );

    // The seller claims it as real tokens.
    call(
        &w.seller,
        &token,
        "storage_deposit",
        json!({ "account_id": w.seller.id() }),
        NearToken::from_millinear(10),
    )
    .await?
    .into_result()?;
    let owed: String = w
        .clearing
        .view("get_claimable")
        .args_json(json!({ "account": w.seller.id(), "token": token.id() }))
        .await?
        .json()?;
    let owed: u128 = owed.parse()?;
    assert!(owed >= 400_000_000, "the price, plus leakage compensation");
    let claimed = call(
        &w.seller,
        &w.clearing,
        "claim",
        json!({ "token": token.id() }),
        NearToken::from_yoctonear(1),
    )
    .await?;
    assert!(claimed.is_success(), "{}", failures(&claimed));
    let on_chain: String = token
        .view("ft_balance_of")
        .args_json(json!({ "account_id": w.seller.id() }))
        .await?
        .json()?;
    assert_eq!(
        on_chain.parse::<u128>()?,
        owed,
        "the seller holds the tokens"
    );
    assert_eq!(
        w.clearing
            .view("get_claimable")
            .args_json(json!({ "account": w.seller.id(), "token": token.id() }))
            .await?
            .json::<String>()?,
        "0"
    );
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// What the room and the compliance service sign, for the two tests above

fn compliance_key() -> SigningKey {
    SigningKey::from_bytes(&[4; 32])
}

fn judge_key() -> secp256k1::SecretKey {
    secp256k1::SecretKey::from_slice(&[0x42; 32]).unwrap()
}

fn judge_address() -> [u8; 20] {
    let secp = secp256k1::Secp256k1::new();
    let public = secp256k1::PublicKey::from_secret_key(&secp, &judge_key());
    let digest = near_sdk::env::keccak256_array(&public.serialize_uncompressed()[1..]);
    digest[12..].try_into().unwrap()
}

/// A receipt the provider's TEE could have signed for `relevance`.
fn judged(relevance: u32, chat: u64) -> JudgeFactor {
    let body = format!("{{\"relevance\":{relevance}}}");
    let text = format!(
        "chat-{chat} model=Qwen/Qwen3.8-27B response={}",
        to_hex(&marginal_core::codec::sha256(&[body.as_bytes()]))
    );
    let secp = secp256k1::Secp256k1::new();
    let hash = near_sdk::env::keccak256_array(&personal_sign_preimage(&text)[..]);
    let (recovery, signature) = secp
        .sign_ecdsa_recoverable(
            &secp256k1::Message::from_slice(&hash).unwrap(),
            &judge_key(),
        )
        .serialize_compact();
    let mut sig65 = [0u8; 65];
    sig65[..64].copy_from_slice(&signature);
    sig65[64] = recovery.to_i32() as u8;
    JudgeFactor {
        model_id: "Qwen/Qwen3.8-27B".into(),
        factor_bps: relevance * 1_000,
        proof: ModelProof::NearAiReceipt {
            text,
            sig65,
            response_body: body,
        },
    }
}

fn verdict_for(w: &World, job_id: u64, listing_id: u64, job: &Value) -> VerdictV1 {
    VerdictV1 {
        domain: VerdictV1::DOMAIN,
        chain_id: CHAIN_ID.into(),
        clearing: w.clearing.id().to_string(),
        job_id,
        job_commitment: marginal_core::json::parse_hex(job["job_commitment"].as_str().unwrap())
            .unwrap(),
        listing_id,
        listing_version: 1,
        appraiser: spec().appraiser,
        status: VerdictStatus::Ok,
        privacy: VerdictPrivacy::Open,
        open: Some(OpenBody {
            components: vec![10_000, 10_000],
            factors: vec![judged(10, 1), judged(10, 2)],
            shown: vec![],
        }),
        sealed: None,
        delivery_commitment: Some([0xd1; 32]),
        cert_hash: [0xce; 32],
        room_key: room_key(),
        nonce: [0x5b; 16],
        t_start: 0,
        t_end: 1,
    }
}

async fn now_secs(w: &World) -> Result<u64> {
    Ok(w.worker.view_block().await?.timestamp() / 1_000_000_000)
}
