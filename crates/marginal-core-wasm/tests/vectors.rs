//! E2.3 and E2.4: `fixtures/vectors.json`, the test vectors every implementation must reproduce.
//!
//! The cases are authored here; their answers come from this crate. The file freezes them, so any
//! change to a formula, a hash or a byte layout shows up as a diff in review, and the room and
//! `replay-ts` check the same file through the wasm build (`@marginal/core-wasm`).
//!
//! If a case changed on purpose: `UPDATE_VECTORS=1 cargo test -p marginal-core-wasm --test vectors`,
//! then review the diff. Cases with a `known` answer also assert a value worked out by hand.

use marginal_core::attest::{evaluate_quote, room_report_data, RegisterRoomRequest};
use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::json::to_hex;
use marginal_core::verifier::{Collateral, VerificationResult};
use marginal_core::RoomClass;
use marginal_core_wasm::call;
use serde_json::{json, to_value, Value};
use sha2::{Digest, Sha256, Sha512};
use std::path::PathBuf;

// The same sample builders the core tests use, not a copy.
#[path = "../../marginal-core/tests/common/mod.rs"]
mod common;
use common::{
    audit_entry, binding, certificate, delivery, h, job_core, key_request, nullifier,
    payout_approval, provisioning, real_events, real_reply_bytes, screening, seller, valid_log,
    verdict, verified_for, NOW,
};
use marginal_core::reports::{ScreeningResult, FLAG_MNPI};

const USDC: u64 = 1_000_000;

struct Case {
    name: &'static str,
    op: &'static str,
    input: Value,
    /// An answer worked out by hand, asserted independently of the code under test.
    known: Option<Value>,
}

fn case(name: &'static str, op: &'static str, input: Value) -> Case {
    Case {
        name,
        op,
        input,
        known: None,
    }
}

fn known(name: &'static str, op: &'static str, input: Value, answer: Value) -> Case {
    Case {
        name,
        op,
        input,
        known: Some(answer),
    }
}

fn ok(value: Value) -> Value {
    json!({ "ok": value })
}

fn err(code: &str) -> Value {
    json!({ "err": code })
}

/// The hex answer of an operation, for cases that feed one operation's output into another.
fn hex_of(op: &str, input: &Value) -> String {
    let reply: Value = serde_json::from_str(&call(op, &input.to_string())).unwrap();
    reply["ok"].as_str().expect("a hex string").to_string()
}

fn knowledge() -> Value {
    json!({"formula": "KnowledgeV1", "components": [8000, 10000], "params": {"delta_star_bps": 0}})
}

fn dataset(components: [u32; 2]) -> Value {
    json!({"formula": "DatasetLiteV0", "components": components, "params": {"delta_star_bps": 500}})
}

fn schema() -> Value {
    json!({"fields": [], "component_alphabets": [21, 21], "judge_scale": 11})
}

fn sha256_of(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    parts.iter().for_each(|p| hasher.update(p));
    to_hex(&hasher.finalize())
}

/// The attestation and key-release cases (SDD §3.12, §3.13). Their answers include ones taken from
/// a REAL TDX quote and a REAL dstack event log (see `fixtures/`).
fn attestation_cases() -> Vec<Case> {
    let real: VerificationResult = from_bytes(&real_reply_bytes()).unwrap();
    let VerificationResult::Verified { report, .. } = &real else {
        panic!("the real reply is a verified report")
    };
    let td = report.report.as_td10().unwrap();
    let real_reply = to_hex(&real_reply_bytes());
    let real_evaluate = |report_data: &[u8; 64], now: u64| json!({"reply": real_reply, "events": to_value(real_events()).unwrap(), "report_data": to_hex(report_data), "now_secs": now});

    let good_log = valid_log();
    let data = room_report_data(&binding());
    let good_reply = to_hex(&to_bytes(&verified_for(&good_log, data)));
    let attested = evaluate_quote(&verified_for(&good_log, data), &good_log, &data, NOW).unwrap();
    let mut without_storage = good_log.clone();
    without_storage.retain(|e| e.name != "storage-encrypted");
    let mut odd_type = good_log.clone();
    odd_type[0].event_type = 1;

    let request = RegisterRoomRequest {
        quote: vec![1, 2, 3],
        collateral: Collateral {
            pck_crl_issuer_chain: "a".into(),
            root_ca_crl: vec![1],
            pck_crl: vec![2],
            tcb_info_issuer_chain: "b".into(),
            tcb_info: "{}".into(),
            tcb_info_signature: vec![3],
            qe_identity_issuer_chain: "c".into(),
            qe_identity: "{}".into(),
            qe_identity_signature: vec![4],
            pck_certificate_chain: Some("d".into()),
        },
        events: good_log.clone(),
        sign_pk: h(1),
        box_pk: h(2),
        nonce: h(3),
        class: RoomClass::K,
        sign_sig: [9; 64],
    };
    let key_request = key_request();
    let path = key_request.path.clone();
    let id = sha256_of(&[
        b"marginal/listing-key/v1",
        &borsh::to_vec(&(seller(), 3u64)).unwrap(),
    ]);
    let signing = [
        b"marginal/keyreq/v1".as_slice(),
        &borsh::to_vec(&key_request).unwrap(),
    ]
    .concat();
    let ppid = [0xab_u8; 16];
    let mut sha512 = Sha512::new();
    sha512.update(b"marginal-room-v1");
    sha512.update(borsh::to_vec(&binding()).unwrap());

    vec![
        known(
            "report data: the binding of a registration",
            "room_report_data",
            to_value(binding()).unwrap(),
            ok(json!(to_hex(&sha512.finalize()))),
        ),
        known(
            "proof of possession: what the room signs to register",
            "room_pop_signing_bytes",
            to_value(binding()).unwrap(),
            ok(json!(to_hex(
                &[
                    b"marginal/room-pop/v1".as_slice(),
                    &room_report_data(&binding())
                ]
                .concat()
            ))),
        ),
        known(
            "rtmr3: a REAL dstack event log replays to the REAL quote's RTMR3",
            "rtmr3_replay",
            json!({"events": to_value(real_events()).unwrap()}),
            ok(json!(to_hex(&td.rt_mr3))),
        ),
        case(
            "rtmr3: replay of the sample room's log",
            "rtmr3_replay",
            json!({"events": to_value(&good_log).unwrap()}),
        ),
        known(
            "rtmr3: an event that is not a dstack event",
            "rtmr3_replay",
            json!({"events": to_value(&odd_type).unwrap()}),
            err("E_RTMR3_EVENTS"),
        ),
        case(
            "room events: the sample room meets the policy",
            "room_events",
            json!({"events": to_value(&good_log).unwrap()}),
        ),
        known(
            "room events: storage-encrypted missing",
            "room_events",
            json!({"events": to_value(&without_storage).unwrap()}),
            err("E_RTMR3_EVENTS"),
        ),
        case(
            "evaluate: the sample room is accepted",
            "evaluate_quote",
            json!({"reply": good_reply, "events": to_value(&good_log).unwrap(), "report_data": to_hex(&data), "now_secs": NOW}),
        ),
        known(
            "evaluate: the report data is for another registration",
            "evaluate_quote",
            json!({"reply": good_reply, "events": to_value(&good_log).unwrap(), "report_data": "00".repeat(64), "now_secs": NOW}),
            err("E_REPORT_DATA"),
        ),
        known(
            "evaluate: a REAL quote passes the hardware checks and fails our event policy",
            "evaluate_quote",
            real_evaluate(&td.report_data, 1_794_443_800),
            err("E_RTMR3_EVENTS"),
        ),
        known(
            "evaluate: the same REAL quote after its collateral expired",
            "evaluate_quote",
            real_evaluate(&td.report_data, 1_797_033_011),
            err("E_COLLATERAL_STALE"),
        ),
        known(
            "evaluate: bytes that are not a verifier reply",
            "evaluate_quote",
            json!({"reply": "00", "events": [], "report_data": "00".repeat(64), "now_secs": NOW}),
            err("E_DECODE"),
        ),
        case(
            "register_room: the operator's request",
            "register_room_encode",
            to_value(&request).unwrap(),
        ),
        known(
            "key request: the bytes a room signs",
            "key_request_signing_bytes",
            to_value(&key_request).unwrap(),
            ok(json!(to_hex(&signing))),
        ),
        known(
            "listing path",
            "listing_path",
            json!({"seller": seller(), "listing_id": 3, "version": 1}),
            ok(json!(format!("listing/{id}/v1"))),
        ),
        known(
            "path hash",
            "path_hash",
            json!({"path": &path}),
            ok(json!(sha256_of(&[b"marginal/path/v1", path.as_bytes()]))),
        ),
        case(
            "measurement hash",
            "measurement_hash",
            to_value(&attested.measurement).unwrap(),
        ),
        known(
            "ppid hash",
            "ppid_hash",
            json!({"ppid": to_hex(&ppid)}),
            ok(json!(sha256_of(&[b"marginal/ppid/v1", &ppid]))),
        ),
        known(
            "ppid hash of the real platform",
            "ppid_hash",
            json!({"ppid": to_hex(&report.ppid)}),
            ok(json!(sha256_of(&[b"marginal/ppid/v1", &report.ppid]))),
        ),
        // What a room signs about a listing (SDD §3.4, E4).
        known(
            "provisioning: what the room signs with the listing key it derived",
            "provisioning_signing_bytes",
            to_value(provisioning()).unwrap(),
            ok(json!(to_hex(
                &[
                    b"marginal/provisioning/v1".as_slice(),
                    &to_bytes(&provisioning())
                ]
                .concat()
            ))),
        ),
        known(
            "screening: what the room signs when a listing passes",
            "screening_signing_bytes",
            to_value(screening(ScreeningResult::Pass)).unwrap(),
            ok(json!(to_hex(
                &[
                    b"marginal/screening/v1".as_slice(),
                    &to_bytes(&screening(ScreeningResult::Pass))
                ]
                .concat()
            ))),
        ),
        case(
            "screening: a listing flagged for MNPI",
            "screening_signing_bytes",
            to_value(screening(ScreeningResult::Flag { reason: FLAG_MNPI })).unwrap(),
        ),
        // What a buyer's job costs and where it may go next (SDD §3.9.1, §3.5; E5).
        known(
            "nullifier: what the compliance service signs",
            "nullifier_signing_bytes",
            to_value(nullifier()).unwrap(),
            ok(json!(to_hex(
                &[b"marginal/nullifier/v1".as_slice(), &to_bytes(&nullifier())].concat()
            ))),
        ),
        known(
            "funding: 1,000 USDC at 25 bps, 2.4 bits at 0.05 USDC a bit",
            "fund",
            json!({
                "budget": (1_000 * USDC).to_string(),
                "compute_fee": (10 * USDC).to_string(),
                "price_per_bit": (USDC / 20).to_string(),
                "max_debit_mbits": 2_400,
                "clearing_fee_buyer_bps": 25,
            }),
            ok(json!({
                "buckets": {
                    "budget": (1_000 * USDC).to_string(),
                    "compute": (10 * USDC).to_string(),
                    "comp_reserved": "120000",
                    "fee_reserved": "2500000",
                    "storage": "0",
                    "held": "0",
                    "refund": "0",
                },
                "total": (1_000 * USDC + 10 * USDC + 120_000 + 2_500_000).to_string(),
            })),
        ),
        known(
            "funding: a leakage price that cannot be paid in whole units is refused",
            "fund",
            json!({
                "budget": "1000",
                "compute_fee": "0",
                "price_per_bit": u128::MAX.to_string(),
                "max_debit_mbits": 2_000,
                "clearing_fee_buyer_bps": 0,
            }),
            json!({"err": "E_ARITHMETIC"}),
        ),
        known(
            "funding: buckets that would not fit in one amount are refused",
            "fund",
            json!({
                "budget": u128::MAX.to_string(),
                "compute_fee": "1",
                "price_per_bit": "0",
                "max_debit_mbits": 0,
                "clearing_fee_buyer_bps": 0,
            }),
            json!({"err": "E_ARITHMETIC"}),
        ),
        known(
            "judge: the strict parse of a relevance answer",
            "parse_relevance",
            json!({"body": r#"{"relevance":7}"#}),
            ok(json!(7_000)),
        ),
        known(
            "judge: anything else scores zero, which resolves to the floor",
            "parse_relevance",
            json!({"body": r#"{"relevance":7}, because the memo says so"#}),
            ok(json!(0)),
        ),
        known(
            "judge: a body with reasoning in it is refused (DR-13)",
            "judge_body_ok",
            json!({"body": r#"{"reasoning_content":"...","relevance":7}"#}),
            ok(json!(false)),
        ),
        known(
            "judge: a receipt commits to the body it signs for",
            "receipt_binds_body",
            json!({
                "text": format!("chat-1 response={}", sha256_of(&[br#"{"relevance":7}"#])),
                "body": r#"{"relevance":7}"#,
            }),
            ok(json!(true)),
        ),
        known(
            "judge: the personal_sign envelope the signature covers",
            "personal_sign_preimage",
            json!({"text": "abc"}),
            ok(json!(to_hex(b"\x19Ethereum Signed Message:\n3abc"))),
        ),
        // Settlement by outcome (SDD §3.9.2). The D1 example: a 400 USDC deal out of a 1,000 USDC
        // budget, 2.4 bits at 0.05 USDC a bit, a 25 bps buyer fee split 50/30/20.
        known(
            "settlement: a deal holds the price and refunds the rest",
            "settle",
            json!({
                "outcome": "Deal",
                "buckets": {
                    "budget": (1_000 * USDC).to_string(),
                    "compute": (10 * USDC).to_string(),
                    "comp_reserved": "120000",
                    "fee_reserved": "2500000",
                    "storage": "0",
                    "held": "0",
                    "refund": "0",
                },
                "price": (400 * USDC).to_string(),
                "price_per_bit": (USDC / 20).to_string(),
                "reserved_mbits": 2_400,
                "clearing_fee_buyer_bps": 25,
                "shares": {"treasury_bps": 5_000, "operator_pool_bps": 3_000, "assurance_pool_bps": 2_000},
            }),
            ok(json!({
                "buckets": {
                    "budget": "0", "compute": "0", "comp_reserved": "0", "fee_reserved": "0",
                    "storage": "0", "held": (400 * USDC).to_string(), "refund": "601500000",
                },
                "fees": {"compute": "0", "treasury": "500000", "operator_pool": "300000", "assurance_pool": "200000"},
                "seller_comp": "120000",
                "operator_compute": (10 * USDC).to_string(),
                "refund": "601500000",
                "held": (400 * USDC).to_string(),
                "leakage_debit_mbits": 2_400,
                "ends_in": "Deal",
            })),
        ),
        case(
            "settlement: a timeout returns everything",
            "settle",
            json!({
                "outcome": "Timeout",
                "buckets": {
                    "budget": (1_000 * USDC).to_string(),
                    "compute": (10 * USDC).to_string(),
                    "comp_reserved": "120000",
                    "fee_reserved": "2500000",
                    "storage": "0",
                    "held": "0",
                    "refund": "0",
                },
                "price": "0",
                "price_per_bit": (USDC / 20).to_string(),
                "reserved_mbits": 2_400,
                "clearing_fee_buyer_bps": 25,
                "shares": {"treasury_bps": 5_000, "operator_pool_bps": 3_000, "assurance_pool_bps": 2_000},
            }),
        ),
        known(
            "settlement: a delivery failure is not a first settlement",
            "settle",
            json!({
                "outcome": "DeliveryFailure",
                "buckets": {
                    "budget": "1000", "compute": "0", "comp_reserved": "0", "fee_reserved": "0",
                    "storage": "0", "held": "0", "refund": "0",
                },
                "price": "0",
                "price_per_bit": "0",
                "reserved_mbits": 0,
                "clearing_fee_buyer_bps": 0,
                "shares": {"treasury_bps": 10_000, "operator_pool_bps": 0, "assurance_pool_bps": 0},
            }),
            json!({"err": "E_JOB_STATE"}),
        ),
        known(
            "payout approval: what compliance signs about a route",
            "payout_approval_signing_bytes",
            to_value(payout_approval()).unwrap(),
            ok(json!(to_hex(
                &[
                    b"marginal/payout-approval/v1".as_slice(),
                    &to_bytes(&payout_approval())
                ]
                .concat()
            ))),
        ),
        known(
            "job state: a verdict can become a deal",
            "job_transition",
            json!({"from": "Verdicted", "to": "Deal"}),
            ok(json!("Deal")),
        ),
        known(
            "job state: a settled job cannot settle again",
            "job_transition",
            json!({"from": "Final", "to": "Deal"}),
            json!({"err": "E_JOB_STATE"}),
        ),
    ]
}

fn cases() -> Vec<Case> {
    let blind = json!("Blind");
    let posted = json!({"Posted": {"ask": (400 * USDC).to_string()}});
    let measured = |factors: Value, l_floor: u32| {
        let mut input = knowledge();
        input["l_floor"] = json!(l_floor);
        input["factors"] = factors;
        input
    };
    let max_debit = |mode: &Value, rule: &Value, privacy: &str| json!({"schema": schema(), "mode": mode, "rule": rule, "privacy": privacy, "n_judges": 2});
    let job = to_value(job_core(true)).unwrap();
    let verdict_full = to_value(verdict(true)).unwrap();
    let verdict_open = to_value(verdict(false)).unwrap();
    let cert = to_value(certificate(true)).unwrap();
    let deliv = to_value(delivery(2)).unwrap();
    let verdict_bytes = hex_of("verdict_encode", &verdict_open);
    let cert_bytes = hex_of("certificate_encode", &cert);
    let deliv_bytes = hex_of("delivery_encode", &deliv);
    let entry = to_value(audit_entry(1)).unwrap();

    let mut all = vec![
        // Pricing (SDD §3.7). The D1 example: D = 0.8, judges 0.9 and 1.0, floor 0.5.
        known(
            "judgement: the lowest factor wins",
            "judgement_factor",
            json!({"l_floor": 5000, "factors": [9000, 10000]}),
            ok(json!(9000)),
        ),
        known(
            "judgement: a failed judge resolves to the floor",
            "judgement_factor",
            json!({"l_floor": 5000, "factors": [0, 10000]}),
            ok(json!(5000)),
        ),
        known(
            "judgement: no judges, no discount",
            "judgement_factor",
            json!({"l_floor": 5000, "factors": []}),
            ok(json!(10000)),
        ),
        known(
            "judgement: factors above 100% are clamped",
            "judgement_factor",
            json!({"l_floor": 0, "factors": [4000000000u32]}),
            ok(json!(10000)),
        ),
        known(
            "ceiling: knowledge",
            "ceiling",
            knowledge(),
            ok(json!(8000)),
        ),
        known(
            "ceiling: dataset-lite, half the target gain and 20% overlap",
            "ceiling",
            dataset([250, 2000]),
            ok(json!(4000)),
        ),
        known(
            "ceiling: dataset v1 is not built",
            "ceiling",
            json!({"formula": "DatasetV1", "components": [1, 2], "params": {"delta_star_bps": 0}}),
            err("E_FORMULA_DISABLED"),
        ),
        known(
            "ceiling: the wrong number of components",
            "ceiling",
            json!({"formula": "KnowledgeV1", "components": [1], "params": {"delta_star_bps": 0}}),
            err("E_SCHEMA"),
        ),
        known(
            "measured index: D1 example",
            "measured_index",
            measured(json!([9000, 10000]), 5000),
            ok(json!(7200)),
        ),
        known(
            "measured index: a failed judge cannot go below the floor",
            "measured_index",
            measured(json!([0, 10000]), 5000),
            ok(json!(4000)),
        ),
        known(
            "valuation: 1,000 USDC at m = 0.72",
            "valuation",
            json!({"budget": (1000 * USDC).to_string(), "m": 7200}),
            ok(json!((720 * USDC).to_string())),
        ),
        known(
            "valuation: the largest budget does not overflow",
            "valuation",
            json!({"budget": u128::MAX.to_string(), "m": 10000}),
            ok(json!(u128::MAX.to_string())),
        ),
        known(
            "valuation: an index above 100% is refused",
            "valuation",
            json!({"budget": "1000", "m": 10001}),
            err("E_SCHEMA"),
        ),
        known(
            "rule: posted price clears at the ask, not at the value",
            "apply_rule",
            json!({"rule": posted, "budget": (1000 * USDC).to_string(), "m": 7200}),
            ok(json!({"Deal": {"price": (400 * USDC).to_string()}})),
        ),
        known(
            "rule: V just below the ask is no deal",
            "apply_rule",
            json!({"rule": posted, "budget": (400 * USDC - 1).to_string(), "m": 10000}),
            ok(json!("NoDeal")),
        ),
        known(
            "rule: a rule that is not built",
            "apply_rule",
            json!({"rule": {"ValueIndexed": {"p_min": "1", "p_full": "2", "price_quantum_bps": 100}}, "budget": "1000", "m": 5000}),
            err("E_RULE_DISABLED"),
        ),
        known(
            "rule: a posted price of zero",
            "apply_rule",
            json!({"rule": {"Posted": {"ask": "0"}}, "budget": "1000", "m": 5000}),
            err("E_RULE_PARAMS"),
        ),
        // Leakage (SDD §3.8).
        known(
            "mbits: 21 levels",
            "mbits",
            json!({"n": 21}),
            ok(json!(4393)),
        ),
        known(
            "mbits: 11 levels",
            "mbits",
            json!({"n": 11}),
            ok(json!(3460)),
        ),
        known(
            "mbits: an empty alphabet is refused",
            "mbits",
            json!({"n": 0}),
            err("E_SCHEMA_INVALID"),
        ),
        known(
            "max_debit: Blind + Sealed is one bit",
            "max_debit",
            max_debit(&blind, &posted, "Sealed"),
            ok(json!(1000)),
        ),
        known(
            "max_debit: Blind + Open is 16.7 bits",
            "max_debit",
            max_debit(&blind, &posted, "Open"),
            ok(json!(16706)),
        ),
        known(
            "max_debit: shown fields are not built",
            "max_debit",
            max_debit(&json!({"Fields": [0]}), &posted, "Sealed"),
            err("E_DISPLAY_DISABLED"),
        ),
        // Commitments (SDD §3.12.3).
        case(
            "job commitment: every optional field set",
            "job_commitment",
            job.clone(),
        ),
        case(
            "job commitment: blind, no snapshot",
            "job_commitment",
            to_value(job_core(false)).unwrap(),
        ),
        case(
            "good commitment",
            "good_commitment",
            json!({"salt": common::h(7).iter().map(|b| format!("{b:02x}")).collect::<String>(), "good": "63616e6f6e6963616c20676f6f64"}),
        ),
        // Messages (SDD §3.17-§3.19).
        case(
            "verdict: Sealed, with a delivery commitment",
            "verdict_encode",
            verdict_full.clone(),
        ),
        case(
            "verdict: Open, with judge proofs",
            "verdict_encode",
            verdict_open.clone(),
        ),
        case(
            "verdict: decode",
            "verdict_decode",
            json!({"bytes": verdict_bytes.clone()}),
        ),
        case(
            "verdict: signing bytes",
            "verdict_signing_bytes",
            verdict_open,
        ),
        case(
            "verdict: signing bytes, Sealed",
            "verdict_signing_bytes",
            verdict_full,
        ),
        case(
            "verdict: truncated bytes",
            "verdict_decode",
            json!({"bytes": &verdict_bytes[..verdict_bytes.len() - 2]}),
        ),
        case(
            "verdict: trailing bytes",
            "verdict_decode",
            json!({"bytes": format!("{verdict_bytes}00")}),
        ),
        case("certificate: encode", "certificate_encode", cert.clone()),
        case(
            "certificate: decode",
            "certificate_decode",
            json!({"bytes": cert_bytes}),
        ),
        case(
            "certificate: signing bytes",
            "certificate_signing_bytes",
            cert.clone(),
        ),
        case("certificate: hash", "certificate_hash", cert),
        case("delivery: encode", "delivery_encode", deliv.clone()),
        case(
            "delivery: decode",
            "delivery_decode",
            json!({"bytes": deliv_bytes}),
        ),
        case("delivery: hash (h_D)", "delivery_hash", deliv),
        // The audit chain (SDD §3.10) and conservation (AC-4).
        case(
            "audit: the first entry after genesis",
            "audit_step",
            json!({"prev_head": "00".repeat(32), "entry": entry}),
        ),
        case(
            "audit: the next entry",
            "audit_step",
            json!({"prev_head": hex_of("audit_step", &json!({"prev_head": "00".repeat(32), "entry": to_value(audit_entry(1)).unwrap()})), "entry": to_value(audit_entry(2)).unwrap()}),
        ),
        known(
            "conservation: a settled deal",
            "check_conservation",
            json!({"deposit": "1026", "buckets": {"budget": "0", "compute": "0", "comp_reserved": "0", "fee_reserved": "11", "storage": "13", "held": "400", "refund": "590"}, "moved_out": "12"}),
            ok(Value::Null),
        ),
        known(
            "conservation: a unit missing",
            "check_conservation",
            json!({"deposit": "1026", "buckets": {"budget": "0", "compute": "0", "comp_reserved": "0", "fee_reserved": "11", "storage": "13", "held": "400", "refund": "590"}, "moved_out": "11"}),
            err("E_CONSERVATION"),
        ),
        known(
            "conservation: the sum overflows",
            "check_conservation",
            json!({"deposit": "0", "buckets": {"budget": u128::MAX.to_string(), "compute": "1", "comp_reserved": "0", "fee_reserved": "0", "storage": "0", "held": "0", "refund": "0"}, "moved_out": "0"}),
            err("E_ARITHMETIC"),
        ),
        // Requests that are not understood.
        known(
            "an unknown operation",
            "no_such_op",
            json!({}),
            err("E_DECODE"),
        ),
        known(
            "input that is not the operation's shape",
            "mbits",
            json!({"n": "21"}),
            err("E_DECODE"),
        ),
    ];
    all.extend(attestation_cases());
    all
}

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/vectors.json")
}

fn answer(c: &Case) -> Value {
    let reply: Value = serde_json::from_str(&call(c.op, &c.input.to_string())).unwrap();
    if let Some(want) = &c.known {
        assert_eq!(
            &reply, want,
            "{}: differs from the answer worked out by hand",
            c.name
        );
    }
    reply
}

fn frozen(cases: &[Case]) -> Value {
    let cases: Vec<Value> = cases
        .iter()
        .map(|c| json!({"name": c.name, "op": c.op, "input": c.input, "expect": answer(c)}))
        .collect();
    json!({ "format": 1, "cases": cases })
}

#[test]
fn the_file_matches_this_crate() {
    let cases = cases();
    let path = vectors_path();
    if std::env::var_os("UPDATE_VECTORS").is_some() {
        std::fs::write(
            &path,
            serde_json::to_string_pretty(&frozen(&cases)).unwrap() + "\n",
        )
        .unwrap();
        return;
    }
    let file: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("fixtures/vectors.json"))
            .unwrap();
    assert_eq!(file, frozen(&cases), "fixtures/vectors.json is out of date: UPDATE_VECTORS=1 cargo test -p marginal-core-wasm --test vectors");
}

#[test]
fn the_cases_cover_every_operation_and_error() {
    let cases = cases();
    let ops: std::collections::BTreeSet<&str> = cases.iter().map(|c| c.op).collect();
    for op in [
        "judgement_factor",
        "ceiling",
        "measured_index",
        "valuation",
        "apply_rule",
        "mbits",
        "max_debit",
        "job_commitment",
        "good_commitment",
        "verdict_encode",
        "verdict_decode",
        "verdict_signing_bytes",
        "certificate_encode",
        "certificate_decode",
        "certificate_signing_bytes",
        "certificate_hash",
        "delivery_encode",
        "delivery_decode",
        "delivery_hash",
        "audit_step",
        "check_conservation",
        "room_report_data",
        "room_pop_signing_bytes",
        "rtmr3_replay",
        "room_events",
        "evaluate_quote",
        "register_room_encode",
        "key_request_signing_bytes",
        "listing_path",
        "path_hash",
        "measurement_hash",
        "ppid_hash",
        "provisioning_signing_bytes",
        "screening_signing_bytes",
        "nullifier_signing_bytes",
        "fund",
        "job_transition",
        "parse_relevance",
        "judge_body_ok",
        "receipt_binds_body",
        "personal_sign_preimage",
        "settle",
        "payout_approval_signing_bytes",
    ] {
        assert!(ops.contains(op), "no vector for {op}");
    }
    let names: std::collections::BTreeSet<&str> = cases.iter().map(|c| c.name).collect();
    assert_eq!(names.len(), cases.len(), "case names are unique");
    assert_eq!(h(1), [1; 32]);
}
