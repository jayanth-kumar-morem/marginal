//! The JSON model: amounts are decimal strings, bytes are hex, and every message round-trips.

use marginal_core::json::{dec, hex, hex_opt, hex_vec, to_hex};
use marginal_core::pricing::RuleOutcome;
use marginal_core::*;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, from_value, json, to_string, to_value, Value};

mod common;
use common::{certificate, delivery, job_core, verdict};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct Probe {
    #[serde(with = "hex")]
    key: [u8; 4],
    #[serde(with = "hex")]
    blob: Vec<u8>,
    #[serde(with = "hex_opt")]
    maybe: Option<[u8; 2]>,
    #[serde(with = "hex_vec")]
    list: Vec<[u8; 2]>,
    #[serde(with = "dec")]
    amount: u128,
    #[serde(with = "dec")]
    small: u32,
}

fn probe() -> Probe {
    Probe {
        key: [1, 2, 3, 255],
        blob: vec![0, 16],
        maybe: Some([171, 205]),
        list: vec![[0, 1], [2, 3]],
        amount: u128::MAX,
        small: 7,
    }
}

#[test]
fn the_helpers_write_lowercase_hex_and_decimal_strings() {
    let json = to_value(probe()).unwrap();
    assert_eq!(
        json,
        json!({"key": "010203ff", "blob": "0010", "maybe": "abcd", "list": ["0001", "0203"],
               "amount": "340282366920938463463374607431768211455", "small": "7"})
    );
    assert_eq!(from_value::<Probe>(json).unwrap(), probe());
    let none = Probe {
        maybe: None,
        list: vec![],
        ..probe()
    };
    assert_eq!(to_value(&none).unwrap()["maybe"], Value::Null);
    assert_eq!(from_value::<Probe>(to_value(&none).unwrap()).unwrap(), none);
    assert_eq!(to_hex(&[0, 255]), "00ff");
}

#[test]
fn the_helpers_refuse_anything_else() {
    let good = to_value(probe()).unwrap();
    let with = |field: &str, value: Value| {
        let mut v = good.clone();
        v[field] = value;
        from_value::<Probe>(v).unwrap_err().to_string()
    };
    assert!(
        with("key", json!("zz")).contains("Invalid character"),
        "not hex"
    );
    assert!(
        with("key", json!("0102")).contains("wrong number of bytes"),
        "wrong length for an array"
    );
    assert!(
        with("key", json!(5)).contains("invalid type"),
        "not a string"
    );
    assert!(
        with("blob", json!("abc")).contains("Odd number"),
        "odd length"
    );
    assert!(with("maybe", json!("00")).contains("wrong number of bytes"));
    assert!(
        with("maybe", json!(5)).contains("invalid type"),
        "an optional hex string is a string or null"
    );
    assert!(
        with("list", json!("0001")).contains("invalid type"),
        "a list of hex strings is a list"
    );
    assert!(with("list", json!(["0001", "xx"])).contains("Invalid character"));
    assert!(with("amount", json!("12x")).contains("invalid digit"));
    assert!(with("amount", json!("-1")).contains("invalid digit"));
    assert!(
        with("amount", json!("340282366920938463463374607431768211456"))
            .contains("number too large"),
        "u128::MAX + 1"
    );
    assert!(
        with("amount", json!(12)).contains("invalid type"),
        "amounts must be strings"
    );
}

fn round_trips<T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug>(
    value: &T,
) -> Value {
    let text = to_string(value).unwrap();
    assert_eq!(&from_str::<T>(&text).unwrap(), value);
    serde_json::to_value(value).unwrap()
}

#[test]
fn every_message_round_trips_through_json() {
    for full in [false, true] {
        round_trips(&job_core(full));
        round_trips(&verdict(full));
        round_trips(&certificate(full));
    }
    for entries in [0, 2] {
        round_trips(&delivery(entries));
    }
    round_trips(&Buckets {
        budget: u128::MAX,
        held: 1,
        ..Default::default()
    });
}

/// The shape other languages depend on. If this changes, `fixtures/vectors.json` changes too.
#[test]
fn the_wire_shape() {
    let job = round_trips(&job_core(true));
    assert_eq!(job["budget"], "1000000000");
    assert_eq!(job["rule"], json!({"Posted": {"ask": "400000000"}}));
    assert_eq!(job["mode"], json!({"Fields": [0, 2]}));
    assert_eq!(job["privacy"], "Open");
    assert_eq!(job["delivery_pk"], "02".repeat(32));
    assert_eq!(job["compliance_pk"], "03".repeat(32));
    assert_eq!(
        job["assigned_rooms"],
        json!(["05".repeat(32), "06".repeat(32)])
    );
    assert_eq!(round_trips(&job_core(false))["mode"], "Blind");
    assert_eq!(round_trips(&job_core(false))["snapshot_id"], Value::Null);

    let v = round_trips(&verdict(true));
    assert_eq!(v["domain"], to_hex(b"marginal/verdict"));
    assert_eq!(v["sealed"]["price"], "400000000");
    assert_eq!(v["open"], Value::Null);
    let open = round_trips(&verdict(false));
    assert_eq!(
        open["open"]["factors"][1]["proof"],
        json!({"WeightsInMeasurement": {"model_hash": "08".repeat(32)}})
    );

    assert_eq!(
        round_trips(&certificate(true))["measurement"]["mrtd"],
        "01".repeat(48)
    );
    // A rule's outcome is only ever an output.
    assert_eq!(
        to_value(RuleOutcome::Deal { price: 400 }).unwrap(),
        json!({"Deal": {"price": "400"}})
    );
    assert_eq!(to_value(RuleOutcome::NoDeal).unwrap(), "NoDeal");
}
