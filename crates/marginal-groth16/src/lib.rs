//! Groth16 verification over NEAR's `alt_bn128` host functions (SDD §3.17; E10.2).
//!
//! The curve work is the protocol's, not ours: one multiexp, one sum to negate `A`, and one pairing
//! check of four pairs. What this crate owns is the **encoding** — NEAR's little-endian field
//! elements and its `(real, imaginary)` order for G2 — and the discipline that makes the call cheap:
//! the verifying key is stored already in the bytes the host functions want, because decoding one
//! from its JSON would cost about 40 TGas, more than the verification itself.
//!
//! It deliberately does not parse a verifying key. A key arrives as prepared bytes, checked for
//! length and for having a point per public input, and nothing else: a key is governance's to set
//! once (`set_verifying_key`), and the shape check is what stops a malformed one being stored.
#![deny(missing_docs)]

use marginal_core::CoreError;
use near_sdk::env;

/// A G1 point: two little-endian 32-byte coordinates.
pub const G1_BYTES: usize = 64;
/// A G2 point: four, ordered `(x.re, x.im, y.re, y.im)`.
pub const G2_BYTES: usize = 128;
/// One field element, little-endian.
pub const FR_BYTES: usize = 32;
/// A proof: `A` (G1), `B` (G2), `C` (G1).
pub const PROOF_BYTES: usize = G1_BYTES + G2_BYTES + G1_BYTES;
/// One pairing argument: a G1 and a G2.
const PAIR_BYTES: usize = G1_BYTES + G2_BYTES;

/// A verifying key, in the bytes the host functions take (§3.17).
///
/// `alpha_beta` is `alpha_g1 ‖ beta_g2`, already a pairing argument. `ic` is one G1 point per
/// public input plus one, in order, which is what the multiexp consumes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedKey<'a> {
    /// `alpha_g1 ‖ beta_g2`, 192 bytes.
    pub alpha_beta: &'a [u8],
    /// `gamma_g2`, 128 bytes.
    pub gamma: &'a [u8],
    /// `delta_g2`, 128 bytes.
    pub delta: &'a [u8],
    /// `IC[0] ‖ IC[1] ‖ …`, 64 bytes each, one more than the number of public inputs.
    pub ic: &'a [u8],
}

impl<'a> PreparedKey<'a> {
    /// Reads a key from one blob: `alpha_beta ‖ gamma ‖ delta ‖ ic`.
    ///
    /// The shape is checked here and nowhere else, so a key that is stored is a key that can be
    /// used: the right lengths, a whole number of `IC` points, and at least one of them.
    pub fn parse(bytes: &'a [u8]) -> Result<Self, CoreError> {
        let fixed = PAIR_BYTES + G2_BYTES + G2_BYTES;
        if bytes.len() < fixed + G1_BYTES || !(bytes.len() - fixed).is_multiple_of(G1_BYTES) {
            return Err(CoreError::ProofInvalid);
        }
        let (alpha_beta, rest) = bytes.split_at(PAIR_BYTES);
        let (gamma, rest) = rest.split_at(G2_BYTES);
        let (delta, ic) = rest.split_at(G2_BYTES);
        Ok(Self {
            alpha_beta,
            gamma,
            delta,
            ic,
        })
    }

    /// How many public inputs this key is for.
    pub fn inputs(&self) -> usize {
        self.ic.len() / G1_BYTES - 1
    }
}

/// Verifies a proof against a prepared key and its public inputs.
///
/// `inputs` are little-endian field elements, in the circuit's own order. The check is
/// `e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) = 1`, where
/// `vk_x = IC[0] + Σ inputᵢ · IC[i+1]`.
///
/// A malformed point makes the host function abort the whole call rather than return false, which
/// is why a caller must treat "this did not return" as a rejected verdict (§3.17's failure
/// handling): the proof is attacker-supplied, so the contract records
/// [`CoreError::ProofInvalid`] and leaves the job open.
pub fn verify(
    key: &PreparedKey<'_>,
    proof: &[u8],
    inputs: &[[u8; FR_BYTES]],
) -> Result<bool, CoreError> {
    if proof.len() != PROOF_BYTES || inputs.len() != key.inputs() {
        return Err(CoreError::ProofInvalid);
    }

    // `vk_x`: one multiexp over every `IC` point, with `IC[0]` taken at one. One call, because each
    // call costs 0.713 TGas before any point (§3.17).
    let mut multiexp = Vec::with_capacity((inputs.len() + 1) * (G1_BYTES + FR_BYTES));
    let mut one = [0u8; FR_BYTES];
    one[0] = 1;
    multiexp.extend_from_slice(&key.ic[..G1_BYTES]);
    multiexp.extend_from_slice(&one);
    for (index, input) in inputs.iter().enumerate() {
        let at = (index + 1) * G1_BYTES;
        multiexp.extend_from_slice(&key.ic[at..at + G1_BYTES]);
        multiexp.extend_from_slice(input);
    }
    let vk_x = env::alt_bn128_g1_multiexp(&multiexp);

    // `-A`: the sum host function takes a sign byte per point, so negating is one call with one
    // point rather than field arithmetic here.
    let mut negate = Vec::with_capacity(1 + G1_BYTES);
    negate.push(1);
    negate.extend_from_slice(&proof[..G1_BYTES]);
    let minus_a = env::alt_bn128_g1_sum(&negate);

    let mut pairs = Vec::with_capacity(4 * PAIR_BYTES);
    pairs.extend_from_slice(&minus_a);
    pairs.extend_from_slice(&proof[G1_BYTES..G1_BYTES + G2_BYTES]);
    pairs.extend_from_slice(key.alpha_beta);
    pairs.extend_from_slice(&vk_x);
    pairs.extend_from_slice(key.gamma);
    pairs.extend_from_slice(&proof[G1_BYTES + G2_BYTES..]);
    pairs.extend_from_slice(key.delta);
    Ok(env::alt_bn128_pairing_check(&pairs))
}

#[cfg(test)]
mod tests {
    use super::*;
    use marginal_core::groth16::{encode_inputs, ProofJson, VerifyingKeyJson};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    /// The committed vectors: a dev verifying key, one valid proof and its public signals, all
    /// produced by snarkjs. Checking against them is what says this encoding is the one the host
    /// functions read.
    fn vectors() -> serde_json::Value {
        serde_json::from_str(include_str!("../../../fixtures/groth16-vectors.json"))
            .expect("the vectors parse")
    }

    fn prepared() -> Vec<u8> {
        let key: VerifyingKeyJson =
            serde_json::from_value(vectors()["vkey"].clone()).expect("a verifying key");
        key.prepare().expect("it prepares")
    }

    fn proof_bytes() -> Vec<u8> {
        let proof: ProofJson = serde_json::from_value(vectors()["proof"].clone()).expect("a proof");
        proof.encode().expect("it encodes")
    }

    fn inputs() -> Vec<[u8; FR_BYTES]> {
        let signals: Vec<String> =
            serde_json::from_value(vectors()["publicSignals"].clone()).expect("signals");
        encode_inputs(&signals)
            .expect("they encode")
            .chunks(FR_BYTES)
            .map(|chunk| <[u8; FR_BYTES]>::try_from(chunk).expect("32 bytes"))
            .collect()
    }

    #[test]
    fn a_real_proof_verifies_through_the_host_functions() {
        testing_env!(VMContextBuilder::new().build());
        let bytes = prepared();
        let key = PreparedKey::parse(&bytes).expect("the key parses");
        assert_eq!(
            key.inputs(),
            8,
            "jc_hi, jc_lo, B, ask, floor, outcome, price, C"
        );
        assert!(verify(&key, &proof_bytes(), &inputs()).expect("it runs"));
    }

    #[test]
    fn a_proof_for_other_inputs_does_not_verify() {
        testing_env!(VMContextBuilder::new().build());
        let bytes = prepared();
        let key = PreparedKey::parse(&bytes).expect("the key parses");
        // The same proof against a different price: the pairing fails, which is the whole point.
        let mut changed = inputs();
        changed[6][0] ^= 1;
        assert!(!verify(&key, &proof_bytes(), &changed).expect("it runs"));
    }

    /// §3.17's failure handling, as the host really behaves: a point that is not on the curve
    /// **aborts** the call instead of returning false. A caller therefore cannot distinguish "the
    /// proof is wrong" from "the call died"; both have to end the same way, with the verdict
    /// rejected and the job left open.
    #[test]
    #[should_panic(expected = "invalid g1")]
    fn a_proof_point_that_is_not_on_the_curve_aborts_the_call() {
        testing_env!(VMContextBuilder::new().build());
        let bytes = prepared();
        let key = PreparedKey::parse(&bytes).expect("the key parses");
        let mut tampered = proof_bytes();
        tampered[0] ^= 1;
        let _ = verify(&key, &tampered, &inputs());
    }

    #[test]
    fn a_malformed_key_or_proof_is_refused_before_any_gas_is_spent() {
        let bytes = prepared();
        assert!(
            PreparedKey::parse(&bytes[..bytes.len() - 1]).is_err(),
            "a half point"
        );
        assert!(
            PreparedKey::parse(&bytes[..G1_BYTES]).is_err(),
            "too short for a key"
        );
        let key = PreparedKey::parse(&bytes).expect("the key parses");
        assert_eq!(
            verify(&key, &proof_bytes()[..PROOF_BYTES - 1], &inputs()),
            Err(CoreError::ProofInvalid),
            "a proof of the wrong length"
        );
        assert_eq!(
            verify(&key, &proof_bytes(), &inputs()[..7]),
            Err(CoreError::ProofInvalid),
            "the wrong number of public inputs"
        );
    }
}
