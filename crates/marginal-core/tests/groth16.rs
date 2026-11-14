//! The Groth16 encodings (SDD §3.17; E10.2): snarkjs's JSON in, the bytes NEAR's `alt_bn128` host
//! functions read out.
//!
//! The happy path is pinned by `fixtures/groth16-vectors.json`, which holds a real verifying key and
//! a real proof, and by `marginal-groth16`'s own test, where that proof verifies through the host
//! functions. What this file covers is every way the input can be wrong: a coordinate that is not a
//! number, one that does not fit the field, a point in a projective form we do not read, a key whose
//! `IC` does not match its input count. Each of those, taken silently, would be a different point
//! and a proof that cannot be checked — so each one is refused.

use marginal_core::groth16::{
    commitment_limbs, decimal_le, encode_inputs, u128_le, u32_le, ProofJson, VerifyingKeyJson,
    FIELD_BYTES, G1_BYTES, G2_BYTES, PROOF_BYTES,
};
use marginal_core::CoreError;

/// 2^256 - 1, the largest value that fits, and 2^256, the smallest that does not.
const MAX: &str = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const OVER: &str = "115792089237316195423570985008687907853269984665640564039457584007913129639936";

#[test]
fn a_decimal_becomes_little_endian_bytes_and_anything_else_is_refused() {
    assert_eq!(decimal_le("0").unwrap(), [0; FIELD_BYTES]);
    let one = decimal_le("1").unwrap();
    assert_eq!(one[0], 1, "little-endian: the low byte first");
    assert_eq!(one[1..], [0; FIELD_BYTES - 1]);
    // 2^64, so the carry really crosses a limb.
    let limb = decimal_le("18446744073709551616").unwrap();
    assert_eq!(limb[8], 1);
    assert_eq!(decimal_le(MAX).unwrap(), [0xff; FIELD_BYTES]);

    // An empty string is not zero, a letter is not a digit, and a 257-bit number does not fit.
    for bad in ["", "12a", "-1", " 1", "1 ", OVER] {
        assert_eq!(decimal_le(bad), Err(CoreError::ProofInvalid), "{bad}");
    }
}

#[test]
fn an_amount_and_a_count_encode_the_same_way_a_decimal_does() {
    assert_eq!(u128_le(u128::MAX)[..16], [0xff; 16]);
    assert_eq!(u128_le(u128::MAX)[16..], [0; 16]);
    assert_eq!(u128_le(400_000_000), decimal_le("400000000").unwrap());
    assert_eq!(u32_le(1_000), decimal_le("1000").unwrap());
}

#[test]
fn the_job_commitment_splits_into_two_limbs_big_endian() {
    let mut commitment = [0u8; 32];
    commitment[0] = 1; // the high limb's most significant byte
    commitment[31] = 2; // the low limb's least significant byte
    let (hi, lo) = commitment_limbs(&commitment);
    // 2^120 as the high limb, 2 as the low one, both little-endian in 32 bytes.
    assert_eq!(
        hi,
        decimal_le("1329227995784915872903807060280344576").unwrap()
    );
    assert_eq!(lo, decimal_le("2").unwrap());
    // And each limb is 128 bits, so the top half of every element is empty.
    assert_eq!(hi[16..], [0; 16]);
    assert_eq!(lo[16..], [0; 16]);
}

#[test]
fn inputs_encode_in_order_and_refuse_a_signal_that_is_not_a_number() {
    let bytes = encode_inputs(&["1".into(), "2".into()]).unwrap();
    assert_eq!(bytes.len(), 2 * FIELD_BYTES);
    assert_eq!(bytes[0], 1);
    assert_eq!(bytes[FIELD_BYTES], 2);
    assert_eq!(encode_inputs(&[]).unwrap(), Vec::<u8>::new());
    assert_eq!(
        encode_inputs(&["1".into(), "two".into()]),
        Err(CoreError::ProofInvalid)
    );
}

fn vectors() -> serde_json::Value {
    serde_json::from_str(include_str!("../../../fixtures/groth16-vectors.json"))
        .expect("the vectors parse")
}

fn key() -> VerifyingKeyJson {
    serde_json::from_value(vectors()["vkey"].clone()).expect("a verifying key")
}

fn proof() -> ProofJson {
    serde_json::from_value(vectors()["proof"].clone()).expect("a proof")
}

#[test]
fn the_committed_key_and_proof_prepare_to_the_sizes_the_host_reads() {
    let prepared = key().prepare().unwrap();
    // alpha_beta ‖ gamma ‖ delta ‖ one IC point per public input, plus one.
    assert_eq!(
        prepared.len(),
        G1_BYTES + G2_BYTES + 2 * G2_BYTES + 9 * G1_BYTES
    );
    assert_eq!(proof().encode().unwrap().len(), PROOF_BYTES);
}

#[test]
fn a_key_that_is_not_this_protocol_or_shape_is_refused() {
    for mutate in [
        |k: &mut VerifyingKeyJson| k.protocol = "plonk".into(),
        |k: &mut VerifyingKeyJson| k.curve = "bls12381".into(),
        // One IC point too few for the inputs it claims.
        |k: &mut VerifyingKeyJson| {
            k.ic.pop();
        },
        // A G1 point that is not `[x, y, 1]`.
        |k: &mut VerifyingKeyJson| k.vk_alpha_1 = vec!["1".into(), "2".into()],
        |k: &mut VerifyingKeyJson| k.vk_alpha_1[2] = "2".into(),
        |k: &mut VerifyingKeyJson| k.vk_alpha_1[0] = "x".into(),
        // The y coordinate is read after x, so it has its own refusal.
        |k: &mut VerifyingKeyJson| k.vk_alpha_1[1] = OVER.into(),
        // A G2 point that is not `[[x0, x1], [y0, y1], [1, 0]]`.
        |k: &mut VerifyingKeyJson| k.vk_beta_2 = vec![vec!["1".into()], vec!["2".into()]],
        |k: &mut VerifyingKeyJson| k.vk_gamma_2[2] = vec!["0".into(), "0".into()],
        |k: &mut VerifyingKeyJson| k.vk_delta_2[2] = vec!["1".into()],
        |k: &mut VerifyingKeyJson| k.vk_beta_2[0] = vec!["1".into()],
        |k: &mut VerifyingKeyJson| k.vk_beta_2[1][1] = OVER.into(),
        // And an IC point, which is read in its own loop.
        |k: &mut VerifyingKeyJson| k.ic[0][0] = "x".into(),
    ] {
        let mut broken = key();
        mutate(&mut broken);
        assert_eq!(broken.prepare(), Err(CoreError::ProofInvalid));
    }
}

#[test]
fn a_proof_that_is_not_this_protocol_or_shape_is_refused() {
    for mutate in [
        |p: &mut ProofJson| p.protocol = "plonk".into(),
        |p: &mut ProofJson| p.curve = "bls12381".into(),
        |p: &mut ProofJson| p.pi_a[0] = "x".into(),
        |p: &mut ProofJson| p.pi_b[0][0] = OVER.into(),
        |p: &mut ProofJson| p.pi_c.truncate(2),
    ] {
        let mut broken = proof();
        mutate(&mut broken);
        assert_eq!(broken.encode(), Err(CoreError::ProofInvalid));
    }
}
