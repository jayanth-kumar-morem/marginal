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
use marginal_core::listing::PublishSpec;
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1, FLAG_MNPI,
};
use marginal_core::{BlobRef, PayoutRoute, RoomClass};
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
    clearing: Contract,
    keypolicy: Contract,
    gov: Account,
    seller: Account,
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
                "challenge_window_secs": 600,
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
        operator: subaccount(&root, "operator").await?,
        worker,
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
