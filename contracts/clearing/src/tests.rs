//! Native unit tests: every method, every refusal, and the records each one writes. Samples come
//! from marginal-core's shared test builders (the same file, not a copy), so a listing is built the
//! way the room and the SDK build one.

// The shared builders include sample data this crate does not use.
#[path = "../../../crates/marginal-core/tests/common/mod.rs"]
mod common;

use common::{measurement, nullifier, provisioning, schema, screening, spec};
use ed25519_dalek::{Signer, SigningKey};
use marginal_core::attest::{ppid_hash, AdmitRoom, MAX_ATTESTATION_SECS};
use marginal_core::certificate::Measurement;
use marginal_core::codec::to_bytes;
use marginal_core::credential::{nullifier_signing_bytes, NullifierCredential};
use marginal_core::json::to_hex;
use marginal_core::judge::personal_sign_preimage;
use marginal_core::listing::{ListingSpec, PublishSpec};
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1, FLAG_MNPI,
};
use marginal_core::request::AppraisalRequest;
use marginal_core::verdict::{
    verdict_signing_bytes, JudgeFactor, ModelProof, OpenBody, VerdictStatus, VerdictV1,
};
use marginal_core::*;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, Gas, NearToken};

use crate::agent::AgentCaps;
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

/// Takes a listing that is already in `Draft` through provisioning, publishing and a `Pass`.
fn publish_through_screening(c: &mut Clearing, listing_id: u64) {
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
    call_as(SELLER, PUBLISH_FEE);
    let job_id = c.publish_listing(U64(listing_id), b64(&publish_spec())).0;
    let screening = screening_report(listing_id, job_id, ScreeningResult::Pass);
    call_as(OPERATOR, no_deposit());
    c.submit_screening(b64(&screening), sign(&screening_signing_bytes(&screening)));
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

/// The compliance issuer whose key governance registers.
fn issuer_key() -> SigningKey {
    SigningKey::from_bytes(&[3; 32])
}

/// A nullifier credential for this chain, contract, listing and buyer, with the issuer's signature.
fn credential(listing_id: u64, epoch: u32) -> (NullifierCredential, [u8; 64]) {
    let credential = NullifierCredential {
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        subject: BUYER.into(),
        listing_id,
        epoch,
        expiry_height: HEIGHT + 1_000,
        ..nullifier()
    };
    let sig = issuer_key()
        .sign(&nullifier_signing_bytes(&credential))
        .to_bytes();
    (credential, sig)
}

/// What a buyer sends: no context, no nullifier, two judges.
fn request(listing_id: u64) -> AppraisalRequest {
    AppraisalRequest {
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
        sealed_context_key: vec![],
        refund_to: RefundRoute::Balance,
        nullifier: None,
        nullifier_sig: None,
    }
}

/// Credits a balance the way a NEP-141 deposit would.
fn fund_buyer(c: &mut Clearing, amount: u128) {
    testing_env!(context(TOKEN, no_deposit(), HEIGHT, NOW).build());
    c.ft_on_transfer(
        account(BUYER),
        U128(amount),
        json!({"Deposit": {"account": BUYER}}).to_string(),
    );
}

/// An active listing with a funded buyer behind it.
fn ready(c: &mut Clearing) -> u64 {
    with_room(c);
    let listing_id = active(c);
    fund_buyer(c, 10_000_000_000);
    listing_id
}

/// The job id out of a `Created` answer.
fn created(answer: &Value) -> u64 {
    assert_eq!(answer["status"], "Created", "{answer}");
    answer["job_id"].as_str().unwrap().parse().unwrap()
}

/// The next call is signed by `key` (an agent key is a key the account registered).
fn call_with_key(who: &str, key: [u8; 32]) {
    let mut pk = vec![0u8];
    pk.extend_from_slice(&key);
    testing_env!(context(who, no_deposit(), HEIGHT, NOW)
        .signer_account_pk(pk.try_into().unwrap())
        .build());
}

fn agent_key() -> [u8; 32] {
    [0x5e; 32]
}

fn caps() -> AgentCaps {
    AgentCaps {
        per_job_budget_max: U128(600_000_000),
        window_max: U128(2_000_000_000),
        window_secs: 3_600,
        max_jobs_per_window: 2,
        human_above: U128(550_000_000),
    }
}

/// The NEAR AI judge's signing key, and the Ethereum address it recovers to.
fn judge_key() -> secp256k1::SecretKey {
    secp256k1::SecretKey::from_slice(&[0x42; 32]).unwrap()
}

fn judge_address() -> [u8; 20] {
    let secp = secp256k1::Secp256k1::new();
    let public = secp256k1::PublicKey::from_secret_key(&secp, &judge_key());
    let uncompressed = public.serialize_uncompressed();
    let digest = near_sdk::env::keccak256_array(&uncompressed[1..]);
    digest[12..].try_into().unwrap()
}

/// Chat ids, so each receipt is its own: one receipt may be used once (§3.16).
static CHAT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// A receipt the provider's TEE could have signed: the text commits to the body, and the signature
/// is `personal_sign` over the text (SDD §3.16).
fn receipt(body: &str) -> ModelProof {
    let chat = CHAT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let text = format!(
        "chat-{chat} model=Qwen/Qwen3.8-27B response={}",
        to_hex(&marginal_core::codec::sha256(&[body.as_bytes()]))
    );
    sign_receipt(&text, body)
}

fn sign_receipt(text: &str, body: &str) -> ModelProof {
    let secp = secp256k1::Secp256k1::new();
    let hash = near_sdk::env::keccak256_array(&personal_sign_preimage(text)[..]);
    let message = secp256k1::Message::from_slice(&hash).unwrap();
    let (recovery, signature) = secp
        .sign_ecdsa_recoverable(&message, &judge_key())
        .serialize_compact();
    let mut sig65 = [0u8; 65];
    sig65[..64].copy_from_slice(&signature);
    sig65[64] = recovery.to_i32() as u8;
    ModelProof::NearAiReceipt {
        text: text.to_string(),
        sig65,
        response_body: body.to_string(),
    }
}

/// Registers the judge's signer so its receipts are accepted.
fn register_judge(c: &mut Clearing) {
    call_as(GOV, no_deposit());
    c.set_ai_signer(
        to_hex(&judge_address()),
        "Qwen/Qwen3.8-27B".into(),
        NOW + 3_600,
    );
}

/// A judge factor backed by a real receipt for `relevance`.
fn judged(relevance: u32) -> JudgeFactor {
    let body = format!("{{\"relevance\":{relevance}}}");
    JudgeFactor {
        model_id: "Qwen/Qwen3.8-27B".into(),
        factor_bps: relevance * 1_000,
        proof: receipt(&body),
    }
}

/// The verdict a room signs for a job, with components that price it at the listing's ask.
fn verdict_for(
    c: &Clearing,
    job_id: u64,
    status: VerdictStatus,
    factors: Vec<JudgeFactor>,
) -> VerdictV1 {
    let job: Job = crate::store::get(crate::store::Table::Job, &crate::store::num(job_id)).unwrap();
    let listing = c.listing(job.listing_id);
    VerdictV1 {
        domain: VerdictV1::DOMAIN,
        chain_id: "sandbox".into(),
        clearing: CLEARING.into(),
        job_id,
        job_commitment: job.job_commitment,
        listing_id: job.listing_id,
        listing_version: job.listing_version,
        appraiser: listing.appraiser.clone(),
        status,
        privacy: VerdictPrivacy::Open,
        open: Some(OpenBody {
            components: vec![10_000, 10_000],
            factors,
            shown: vec![],
        }),
        sealed: None,
        delivery_commitment: Some([0xd1; 32]),
        cert_hash: [0xce; 32],
        room_key: room_key(),
        nonce: [0x5b; 16],
        t_start: HEIGHT,
        t_end: HEIGHT + 1,
    }
}

fn sign_verdict(v: &VerdictV1) -> Base64VecU8 {
    sign(&verdict_signing_bytes(v))
}

/// A job that has been authorised and is waiting for its verdict.
fn computing(c: &mut Clearing) -> (u64, u64) {
    let listing_id = ready(c);
    register_judge(c);
    call_as(BUYER, no_deposit());
    let job_id = created(&c.request_appraisal(b64(&request(listing_id))));
    let commitment = c.get_job(U64(job_id)).unwrap()["job_commitment"]
        .as_str()
        .unwrap()
        .to_string();
    let path = to_hex(&c.listing(listing_id).key_path_hash);
    call_as(KEYPOLICY, no_deposit());
    c.authorize_release(job_id, to_hex(&room_key()), path, commitment, json!("M"));
    (listing_id, job_id)
}

mod agents;
mod audit;
mod escrow;
mod gov;
mod identity;
mod jobs;
mod listings;
mod payouts;
mod registry;
mod verdicts;
mod views;
