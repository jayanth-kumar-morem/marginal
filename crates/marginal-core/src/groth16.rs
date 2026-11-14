//! The wire format of a Groth16 proof and its verifying key (SDD §3.17; E10.2).
//!
//! snarkjs writes points as decimal strings; NEAR's `alt_bn128` host functions take little-endian
//! 32-byte coordinates. That conversion is the whole of this module, and it lives here rather than
//! in the room or the deploy script because three places need it — the room that proves, the
//! deploy that seeds the verifying key, and the verifier that re-checks a settlement — and three
//! copies of a byte order would eventually disagree.
//!
//! The verifying key is **prepared**: laid out as `alpha_g1 ‖ beta_g2 ‖ gamma_g2 ‖ delta_g2 ‖ IC`,
//! which is the order `marginal-groth16` feeds straight to the host functions. Decoding a key from
//! JSON on chain would cost about 40 TGas, more than the verification it enables.

use alloc::string::String;
use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// A field element, little-endian.
pub const FIELD_BYTES: usize = 32;
/// A G1 point: `x ‖ y`.
pub const G1_BYTES: usize = 64;
/// A G2 point: `x.re ‖ x.im ‖ y.re ‖ y.im`, which is NEAR's order.
pub const G2_BYTES: usize = 128;
/// A proof: `A ‖ B ‖ C`.
pub const PROOF_BYTES: usize = G1_BYTES + G2_BYTES + G1_BYTES;

/// A 256-bit decimal string as little-endian bytes.
///
/// Rejects anything that is not decimal, and anything that does not fit: a coordinate that
/// overflowed would otherwise silently become a different point.
pub fn decimal_le(value: &str) -> Result<[u8; FIELD_BYTES], CoreError> {
    if value.is_empty() {
        return Err(CoreError::ProofInvalid);
    }
    let mut limbs = [0u64; 4];
    for digit in value.bytes() {
        if !digit.is_ascii_digit() {
            return Err(CoreError::ProofInvalid);
        }
        let mut carry = u128::from(digit - b'0');
        for limb in &mut limbs {
            let product = u128::from(*limb) * 10 + carry;
            *limb = product as u64;
            carry = product >> 64;
        }
        if carry != 0 {
            return Err(CoreError::ProofInvalid);
        }
    }
    let mut bytes = [0u8; FIELD_BYTES];
    for (index, limb) in limbs.iter().enumerate() {
        bytes[index * 8..index * 8 + 8].copy_from_slice(&limb.to_le_bytes());
    }
    Ok(bytes)
}

fn push_g1(out: &mut Vec<u8>, point: &[String]) -> Result<(), CoreError> {
    // snarkjs writes G1 projectively as `[x, y, z]` with `z = 1`; anything else is not a point we
    // know how to read, so it is refused rather than guessed at.
    let [x, y, z] = point else {
        return Err(CoreError::ProofInvalid);
    };
    if z != "1" {
        return Err(CoreError::ProofInvalid);
    }
    out.extend_from_slice(&decimal_le(x)?);
    out.extend_from_slice(&decimal_le(y)?);
    Ok(())
}

fn push_g2(out: &mut Vec<u8>, point: &[Vec<String>]) -> Result<(), CoreError> {
    let [x, y, z] = point else {
        return Err(CoreError::ProofInvalid);
    };
    if z.len() != 2 || z[0] != "1" || z[1] != "0" {
        return Err(CoreError::ProofInvalid);
    }
    for coordinate in [x, y] {
        if coordinate.len() != 2 {
            return Err(CoreError::ProofInvalid);
        }
        // Real first, then imaginary, which is the order NEAR's host functions read.
        out.extend_from_slice(&decimal_le(&coordinate[0])?);
        out.extend_from_slice(&decimal_le(&coordinate[1])?);
    }
    Ok(())
}

/// A verifying key as `snarkjs zkey export verificationkey` writes it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct VerifyingKeyJson {
    /// Always `groth16`; another protocol's key would not verify anything.
    pub protocol: String,
    pub curve: String,
    #[serde(rename = "nPublic")]
    pub n_public: usize,
    pub vk_alpha_1: Vec<String>,
    pub vk_beta_2: Vec<Vec<String>>,
    pub vk_gamma_2: Vec<Vec<String>>,
    pub vk_delta_2: Vec<Vec<String>>,
    #[serde(rename = "IC")]
    pub ic: Vec<Vec<String>>,
}

impl VerifyingKeyJson {
    /// Lays the key out as `marginal-groth16` reads it.
    pub fn prepare(&self) -> Result<Vec<u8>, CoreError> {
        if self.protocol != "groth16" || self.curve != "bn128" {
            return Err(CoreError::ProofInvalid);
        }
        // One `IC` point per public input, plus one: that is what makes the multiexp come out as
        // `IC[0] + Σ inputᵢ·IC[i+1]`.
        if self.ic.len() != self.n_public + 1 {
            return Err(CoreError::ProofInvalid);
        }
        let mut out = Vec::with_capacity(G1_BYTES + 3 * G2_BYTES + self.ic.len() * G1_BYTES);
        push_g1(&mut out, &self.vk_alpha_1)?;
        push_g2(&mut out, &self.vk_beta_2)?;
        push_g2(&mut out, &self.vk_gamma_2)?;
        push_g2(&mut out, &self.vk_delta_2)?;
        for point in &self.ic {
            push_g1(&mut out, point)?;
        }
        Ok(out)
    }
}

/// A proof as snarkjs writes it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofJson {
    pub pi_a: Vec<String>,
    pub pi_b: Vec<Vec<String>>,
    pub pi_c: Vec<String>,
    pub protocol: String,
    pub curve: String,
}

impl ProofJson {
    /// `A ‖ B ‖ C`, 256 bytes.
    pub fn encode(&self) -> Result<Vec<u8>, CoreError> {
        if self.protocol != "groth16" || self.curve != "bn128" {
            return Err(CoreError::ProofInvalid);
        }
        let mut out = Vec::with_capacity(PROOF_BYTES);
        push_g1(&mut out, &self.pi_a)?;
        push_g2(&mut out, &self.pi_b)?;
        push_g1(&mut out, &self.pi_c)?;
        Ok(out)
    }
}

/// The job commitment as the circuit sees it: two 128-bit limbs, each a field element.
///
/// A 256-bit hash does not fit in BN254's field, so §3.17 splits it. The split is big-endian —
/// `jc[0..16]` is the high limb — and it is defined here because the room, the circuit and the
/// contract must agree on it to the bit: a different split is a different public input and the
/// proof simply would not verify.
pub fn commitment_limbs(commitment: &[u8; 32]) -> ([u8; FIELD_BYTES], [u8; FIELD_BYTES]) {
    let mut hi = [0u8; FIELD_BYTES];
    let mut lo = [0u8; FIELD_BYTES];
    // Big-endian in, little-endian out: byte `i` of a big-endian limb is byte `15 - i` of the
    // little-endian field element.
    for index in 0..16 {
        hi[15 - index] = commitment[index];
        lo[15 - index] = commitment[16 + index];
    }
    (hi, lo)
}

/// A `u128` as a little-endian field element: the budget, the ask and the price (§3.17).
pub fn u128_le(value: u128) -> [u8; FIELD_BYTES] {
    let mut bytes = [0u8; FIELD_BYTES];
    bytes[..16].copy_from_slice(&value.to_le_bytes());
    bytes
}

/// A `u32` as a little-endian field element: a component, a factor or the outcome bit.
pub fn u32_le(value: u32) -> [u8; FIELD_BYTES] {
    let mut bytes = [0u8; FIELD_BYTES];
    bytes[..4].copy_from_slice(&value.to_le_bytes());
    bytes
}

/// The public signals of a proof, in the circuit's order, as little-endian field elements.
pub fn encode_inputs(signals: &[String]) -> Result<Vec<u8>, CoreError> {
    let mut out = Vec::with_capacity(signals.len() * FIELD_BYTES);
    for signal in signals {
        out.extend_from_slice(&decimal_le(signal)?);
    }
    Ok(out)
}
