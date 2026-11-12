//! Native unit tests: every method, every refusal, and the exact calls KeyPolicy makes to the
//! verifier, the registry, clearing and the MPC network. Samples come from marginal-core's shared
//! test builders (the same file, not a copy), so the room's side of every protocol is built the same
//! way the contract checks it.

// The shared builders include sample data this crate does not use.
#[path = "../../../crates/marginal-core/tests/common/mod.rs"]
mod common;

use common::{binding, fixture, key_request, seller, valid_log, verified_for, NOW};
use ed25519_dalek::{Signer, SigningKey};
use marginal_core::attest::{
    room_pop_signing_bytes, room_report_data, RegisterRoomRequest, RoomBinding,
};
use marginal_core::certificate::{measurement_hash, Measurement};
use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::json::to_hex;
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, path_hash, KeyRequest};
use marginal_core::verifier::{verify_args, Collateral};
use marginal_core::{RoomClass, ValueClass};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::mock::MockAction;
use near_sdk::serde_json::{json, Value};
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{
    env, test_vm_config, testing_env, AccountId, Gas, NearToken, PromiseResult, RuntimeFeesConfig,
};

use crate::{
    KeyPolicy, ATTESTATION_FEE, NONCE_FEE, NONCE_TTL_BLOCKS, PINS_FEE, TICKET_FEE,
    TICKET_TTL_BLOCKS,
};

const KEYPOLICY: &str = "keypolicy.marginal-demo.testnet";
const REGISTRY: &str = "registry.marginal-demo.testnet";
const CLEARING: &str = "clearing.marginal-demo.testnet";
const MPC: &str = "v1.signer-prod.testnet";
const VERIFIER: &str = "tee-verifier-2026-11-02.testnet";
const HEIGHT: u64 = 1_000;

fn account(id: &str) -> AccountId {
    id.parse().unwrap()
}

fn context(predecessor: &str, deposit: NearToken, height: u64, now_secs: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account(KEYPOLICY))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .attached_deposit(deposit)
        .block_height(height)
        .block_timestamp(now_secs * 1_000_000_000)
        .random_seed([9; 32])
        .prepaid_gas(Gas::from_tgas(300));
    builder
}

/// The next call is made by `who` with `deposit` attached, at the default time.
fn call_as(who: &str, deposit: NearToken) {
    testing_env!(context(who, deposit, HEIGHT, NOW).build());
}

fn call_at(who: &str, deposit: NearToken, height: u64, now_secs: u64) {
    testing_env!(context(who, deposit, height, now_secs).build());
}

fn no_deposit() -> NearToken {
    NearToken::from_yoctonear(0)
}

/// The next call is a callback of this contract, with these promise results.
fn callback_with(results: Vec<PromiseResult>) {
    callback_at(HEIGHT, NOW, results);
}

fn callback_at(height: u64, now_secs: u64, results: Vec<PromiseResult>) {
    testing_env!(
        context(KEYPOLICY, no_deposit(), height, now_secs).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

fn ok(bytes: Vec<u8>) -> PromiseResult {
    PromiseResult::Successful(bytes)
}

fn contract() -> KeyPolicy {
    call_as("deployer", no_deposit());
    KeyPolicy::new(
        "testnet".into(),
        account(REGISTRY),
        account(CLEARING),
        account(MPC),
        2,
        account(VERIFIER),
    )
}

/// One function call KeyPolicy scheduled.
#[derive(Debug)]
struct Sent {
    to: String,
    method: String,
    args: Vec<u8>,
    deposit: u128,
    gas: u64,
    weight: u64,
}

impl Sent {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.args).unwrap()
    }
}

/// Every call scheduled so far, in order. Anything other than a function call fails the test: this
/// contract must never schedule a transfer, a deployment or a key change.
fn sent() -> Vec<Sent> {
    let mut out = vec![];
    for receipt in get_created_receipts() {
        for action in &receipt.actions {
            match action {
                MockAction::CreateReceipt { .. } => {}
                MockAction::FunctionCallWeight {
                    method_name,
                    args,
                    attached_deposit,
                    prepaid_gas,
                    gas_weight,
                    ..
                } => out.push(Sent {
                    to: receipt.receiver_id.to_string(),
                    method: String::from_utf8(method_name.clone()).unwrap(),
                    args: args.clone(),
                    deposit: attached_deposit.as_yoctonear(),
                    gas: prepaid_gas.as_gas(),
                    weight: gas_weight.0,
                }),
                other => {
                    panic!("KeyPolicy scheduled something other than a function call: {other:?}")
                }
            }
        }
    }
    out
}

fn b64(bytes: Vec<u8>) -> Base64VecU8 {
    Base64VecU8(bytes)
}

fn room_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

fn room_key() -> [u8; 32] {
    room_signing_key().verifying_key().to_bytes()
}

fn collateral() -> Collateral {
    from_bytes(&std::fs::read(fixture("tee-verifier-args.borsh")).unwrap()[4 + 5_006..]).unwrap()
}

/// A registration signed by `room`, the way a room signs its own.
fn request_for(room: &SigningKey, box_pk: [u8; 32], nonce: [u8; 32]) -> RegisterRoomRequest {
    let mut request = RegisterRoomRequest {
        quote: vec![1, 2, 3, 4, 5],
        collateral: collateral(),
        events: valid_log(),
        sign_pk: room.verifying_key().to_bytes(),
        box_pk,
        nonce,
        class: RoomClass::K,
        sign_sig: [0; 64],
    };
    request.sign_sig = room
        .sign(&room_pop_signing_bytes(&binding_for(&request)))
        .to_bytes();
    request
}

fn binding_for(request: &RegisterRoomRequest) -> RoomBinding {
    RoomBinding {
        sign_pk: request.sign_pk,
        box_pk: request.box_pk,
        nonce: request.nonce,
        ..binding()
    }
}

/// A fresh nonce, as the operator would get it.
fn issue_nonce(c: &mut KeyPolicy) -> [u8; 32] {
    call_as("operator.testnet", NONCE_FEE);
    hex::decode(c.issue_nonce()).unwrap().try_into().unwrap()
}

/// The verifier's answer for this request, as bytes.
fn verifier_says(request: &RegisterRoomRequest) -> Vec<u8> {
    to_bytes(&verified_for(
        &request.events,
        room_report_data(&binding_for(request)),
    ))
}

/// Registers a room end to end through the real call path: nonce, `register_room`, the verifier's
/// answer. Returns the receipts the callback scheduled.
fn register(c: &mut KeyPolicy, request: RegisterRoomRequest, verifier_reply: Vec<u8>) {
    call_as("operator.testnet", ATTESTATION_FEE);
    c.register_room(b64(to_bytes(&request)));
    let pending = pending_of_last_call();
    callback_with(vec![ok(verifier_reply)]);
    c.on_quote_verified(pending);
}

/// The callback argument `register_room` just passed to itself.
fn pending_of_last_call() -> Base64VecU8 {
    let callback = sent()
        .into_iter()
        .find(|s| s.method == "on_quote_verified")
        .expect("a callback was scheduled");
    serde_json::from_value(callback.json()["pending"].clone()).unwrap()
}

/// A room that registered successfully, whose signing key is `room_signing_key()`.
fn registered_room(c: &mut KeyPolicy) -> RegisterRoomRequest {
    let nonce = issue_nonce(c);
    let request = request_for(&room_signing_key(), [2; 32], nonce);
    let reply = verifier_says(&request);
    register(c, request.clone(), reply);
    request
}

fn measurement_of(c: &KeyPolicy) -> Measurement {
    let a: crate::store::Attestation =
        crate::store::get(crate::store::Table::Attestation, &room_key()).unwrap();
    let _ = c;
    a.measurement
}

fn room_measurement_hash(c: &KeyPolicy) -> String {
    to_hex(&measurement_hash(&measurement_of(c)))
}

fn set_pins(c: &mut KeyPolicy, who: &str, listing: u64, version: u32, pins: Option<Vec<String>>) {
    call_as(who, PINS_FEE);
    c.set_pins(U64(listing), version, pins);
}

fn request_with(path: &str) -> KeyRequest {
    KeyRequest {
        keypolicy: KEYPOLICY.into(),
        room_key: room_key(),
        path: path.into(),
        ..key_request()
    }
}

fn signed(request: &KeyRequest) -> (Base64VecU8, Base64VecU8) {
    (
        b64(to_bytes(request)),
        b64(room_signing_key()
            .sign(&key_request_signing_bytes(request))
            .to_bytes()
            .to_vec()),
    )
}

fn authorize(c: &mut KeyPolicy, request: &KeyRequest) {
    call_as("relayer.testnet", TICKET_FEE);
    let (bytes, sig) = signed(request);
    c.authorize(bytes, sig);
}

fn room_check(ok: bool) -> PromiseResult {
    ok_json(json!({"ok": ok, "deny_reasons": []}))
}

fn ok_json(value: Value) -> PromiseResult {
    ok(serde_json::to_vec(&value).unwrap())
}

/// A ticket for `request`, issued the way `on_authorized` does.
fn issue_ticket(c: &mut KeyPolicy, request: &KeyRequest) -> u64 {
    callback_with(vec![room_check(true), ok(vec![])]);
    c.on_authorized(b64(to_bytes(request))).0
}

/// Everything needed to authorize: a registered room whose measurement the seller pinned.
fn ready(c: &mut KeyPolicy) -> KeyRequest {
    registered_room(c);
    let path = listing_path(&seller(), 3, 1);
    set_pins(
        c,
        &seller().to_string(),
        3,
        1,
        Some(vec![room_measurement_hash(c)]),
    );
    request_with(&path)
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
        .map(|j| serde_json::from_str(j).unwrap())
        .collect()
}

mod pins_and_views;
mod registration;
mod release;
#[cfg(feature = "sim-attestation")]
mod sim;
