//! Native unit tests: every method, every refusal, and the records each one writes. Samples come
//! from marginal-core's shared test builders (the same file, not a copy), so a listing is built the
//! way the room and the SDK build one.

// The shared builders include sample data this crate does not use.
#[path = "../../../crates/marginal-core/tests/common/mod.rs"]
mod common;

use common::{measurement, provisioning, schema, screening, spec};
use ed25519_dalek::{Signer, SigningKey};
use marginal_core::attest::{ppid_hash, AdmitRoom, MAX_ATTESTATION_SECS};
use marginal_core::certificate::Measurement;
use marginal_core::codec::to_bytes;
use marginal_core::json::to_hex;
use marginal_core::listing::{ListingSpec, PublishSpec};
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1, FLAG_MNPI,
};
use marginal_core::*;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, Gas, NearToken};

use crate::registry::MeasurementSet;
use crate::{
    Clearing, FeeTable, ProfileConfig, LISTING_FEE, PLATFORM_FEE, PUBLISH_FEE, SET_FEE,
    SNAPSHOT_FEE,
};

const CLEARING: &str = "clearing.marginal-demo.testnet";
const KEYPOLICY: &str = "keypolicy.marginal-demo.testnet";
const GOV: &str = "gov.marginal-demo.testnet";
const SELLER: &str = "seller.testnet";
const BUYER: &str = "buyer.testnet";
const TOKEN: &str = "musdc.marginal-demo.testnet";
const OPERATOR: &str = "operator.testnet";
const HEIGHT: u64 = 1_000;
const NOW: u64 = 1_794_000_000;
const PPID: [u8; 16] = [0x77; 16];

fn account(id: &str) -> AccountId {
    id.parse().unwrap()
}

fn context(predecessor: &str, deposit: NearToken, height: u64, now_secs: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account(CLEARING))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .attached_deposit(deposit)
        .block_height(height)
        .block_timestamp(now_secs * 1_000_000_000)
        .random_seed([9; 32])
        .prepaid_gas(Gas::from_tgas(300));
    builder
}

fn call_as(who: &str, deposit: NearToken) {
    testing_env!(context(who, deposit, HEIGHT, NOW).build());
}

fn call_at(who: &str, deposit: NearToken, height: u64, now_secs: u64) {
    testing_env!(context(who, deposit, height, now_secs).build());
}

fn no_deposit() -> NearToken {
    NearToken::from_yoctonear(0)
}

fn profile() -> ProfileConfig {
    ProfileConfig {
        profile: "sandbox".into(),
        gov_profile: "demo".into(),
        cooling_blocks: 0,
        challenge_window_secs: 600,
        rules_enabled: vec!["R1".into()],
        asset_classes_enabled: vec!["Knowledge".into(), "Dataset".into()],
    }
}

/// A contract with the governance policy a listing needs: one appraiser, the demo token.
fn contract() -> Clearing {
    call_as(GOV, no_deposit());
    let mut c = Clearing::new(
        account(GOV),
        account(KEYPOLICY),
        "sandbox".into(),
        vec![account(TOKEN)],
        profile(),
    );
    call_as(GOV, no_deposit());
    c.set_appraiser("knowledge".into(), 1, "KnowledgeV1".into(), U128(10), true);
    c
}

/// The room every test uses, admitted through KeyPolicy.
fn room_key() -> [u8; 32] {
    room_signing_key().verifying_key().to_bytes()
}

fn room_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

fn measurement_set() -> MeasurementSet {
    MeasurementSet {
        id: "knowledge-room@1.0.0".into(),
        members: vec![measurement(false)],
        source_tag: "v0.1.0 abcdef".into(),
    }
}

fn admit(room_key: [u8; 32], measurement: Measurement, ppid: [u8; 16]) -> Value {
    json!({ "room": AdmitRoom {
        room_key,
        box_pk: [2; 32],
        ppid_hash: ppid_hash(&ppid),
        measurement,
        class: RoomClass::Kcpu,
        tcb_status: "UpToDate".into(),
        tee_tcb_svn: [0; 16],
        registered_height: HEIGHT,
        expires_at: NOW + MAX_ATTESTATION_SECS,
        collateral_issued_at: NOW,
        quote_hash: [3; 32],
        attestation_mode: AttestationMode::OnChainDcap,
    }})["room"]
        .clone()
}

/// Governance approves the measurement set and the platform, then KeyPolicy admits the room.
fn with_room(c: &mut Clearing) {
    call_as(GOV, SET_FEE);
    c.approve_measurement_set(Base64VecU8(
        near_sdk::borsh::to_vec(&measurement_set()).unwrap(),
    ));
    call_as(GOV, PLATFORM_FEE);
    c.admit_platform(hex::encode(PPID), account(OPERATOR), U128(1_000));
    call_as(KEYPOLICY, no_deposit());
    c.admit_room(admit(room_key(), measurement(false), PPID));
}

fn b64<T: borsh::BorshSerialize>(value: &T) -> Base64VecU8 {
    Base64VecU8(to_bytes(value))
}

fn publish_spec() -> PublishSpec {
    PublishSpec {
        good_commitment: [0xab; 32],
        ciphertext: BlobRef {
            uri_hash: [1; 32],
            sha256: [2; 32],
            size_class: 3,
        },
        payout: PayoutRoute::NearAccount(SELLER.into()),
    }
}

/// A listing in `Draft`, created by the seller.
fn draft(c: &mut Clearing) -> u64 {
    call_as(SELLER, LISTING_FEE);
    c.create_listing(b64(&spec())).0
}

/// A provisioned listing: the room has reported its `pk_l`.
fn provisioned(c: &mut Clearing) -> u64 {
    let listing_id = draft(c);
    call_as(SELLER, no_deposit());
    let job_id = c.begin_provisioning(U64(listing_id)).0;
    let report = ProvisioningV1 {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        ..provisioning()
    };
    call_as(OPERATOR, no_deposit());
    c.submit_provisioning(b64(&report), sign(&provisioning_signing_bytes(&report)));
    listing_id
}

/// A published listing waiting on its screening job: returns `(listing_id, job_id)`.
fn screening_job(c: &mut Clearing) -> (u64, u64) {
    let listing_id = provisioned(c);
    call_as(SELLER, PUBLISH_FEE);
    let job_id = c.publish_listing(U64(listing_id), b64(&publish_spec())).0;
    (listing_id, job_id)
}

fn screening_report(listing_id: u64, job_id: u64, result: ScreeningResult) -> ScreeningV1 {
    ScreeningV1 {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        listing_id,
        listing_version: 1,
        room_key: room_key(),
        result,
        ..screening(result)
    }
}

fn sign(message: &[u8]) -> Base64VecU8 {
    Base64VecU8(room_signing_key().sign(message).to_bytes().to_vec())
}

/// An `Active` listing: created, provisioned, published and screened `Pass`.
fn active(c: &mut Clearing) -> u64 {
    let (listing_id, job_id) = screening_job(c);
    let report = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&report), sign(&screening_signing_bytes(&report)));
    listing_id
}

fn status(c: &Clearing, listing_id: u64) -> String {
    c.get_listing(U64(listing_id)).unwrap()["status"]
        .as_str()
        .unwrap()
        .to_string()
}

fn expect_panic(code: &str, f: impl FnOnce()) {
    let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f))
        .expect_err("the call should have been refused");
    let message = err
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default();
    assert!(message.contains(code), "expected {code}, got: {message}");
}

fn events() -> Vec<Value> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| near_sdk::serde_json::from_str(j).unwrap())
        .collect()
}

mod audit;
mod gov;
mod listings;
mod registry;
mod views;
