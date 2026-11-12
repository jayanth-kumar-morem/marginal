//! E2.3 and E2.4: `fixtures/vectors.json`, the test vectors every implementation must reproduce.
//!
//! The cases are authored here; their answers come from this crate. The file freezes them, so any
//! change to a formula, a hash or a byte layout shows up as a diff in review, and the room and
//! `replay-ts` check the same file through the wasm build (`@marginal/core-wasm`).
//!
//! If a case changed on purpose: `UPDATE_VECTORS=1 cargo test -p marginal-core-wasm --test vectors`,
//! then review the diff. Cases with a `known` answer also assert a value worked out by hand.

use marginal_core_wasm::call;
use serde_json::{json, to_value, Value};
use std::path::PathBuf;

// The same sample builders the core tests use, not a copy.
#[path = "../../marginal-core/tests/common/mod.rs"]
mod common;
use common::{audit_entry, certificate, delivery, h, job_core, verdict};

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

    vec![
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
    ]
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
    ] {
        assert!(ops.contains(op), "no vector for {op}");
    }
    let names: std::collections::BTreeSet<&str> = cases.iter().map(|c| c.name).collect();
    assert_eq!(names.len(), cases.len(), "case names are unique");
    assert_eq!(h(1), [1; 32]);
}
