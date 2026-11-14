//! What clearing checks about a judge's receipt (SDD §3.16, AC-25).
//!
//! The parts that need no host functions live here, so `replay-ts` re-checks a published verdict
//! exactly as the contract did: the strict parse, the reasoning-field rule, the body binding and
//! the bytes an `ecrecover` runs over. The recovery itself is a host function, so it stays in the
//! contract.

use alloc::string::String;
use alloc::vec::Vec;

use crate::codec::sha256;
use crate::json::to_hex;
use crate::pricing::BPS;

/// The judge answers on an integer scale of 0 to 10 (§3.16).
pub const MAX_RELEVANCE: u32 = 10;
/// One point of relevance, in basis points.
pub const BPS_PER_POINT: u32 = BPS / MAX_RELEVANCE;

/// The strict parse of a judge's answer (DR-2): the body must be exactly `{"relevance":k}` with
/// `k` in `0..=10`, give or take whitespace, because constrained decoding may add spaces.
///
/// Anything else gives 0, which resolves to the listing's floor (AC-41). This never fails: a judge
/// that answers badly costs its own factor, not the job.
pub fn parse_relevance(body: &str) -> u32 {
    let mut rest = body.trim_start();
    for token in ["{", "\"relevance\"", ":"] {
        match rest.strip_prefix(token) {
            Some(tail) => rest = tail.trim_start(),
            None => return 0,
        }
    }
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();

    // Trailing whitespace after the closing brace is fine; anything else is not.
    if rest[digits.len()..].trim() != "}" {
        return 0;
    }
    match digits.parse::<u32>() {
        // "10" and "0".."9" only: no leading zeros, no empty string, nothing above the scale.
        Ok(k) if k <= MAX_RELEVANCE && (digits.len() == 1 || digits == "10") => k * BPS_PER_POINT,
        _ => 0,
    }
}

/// Whether the response body carries any reasoning (DR-13). In Open mode the body is published, and
/// reasoning can quote the good, so a body that has any is refused with factor 0.
pub fn has_reasoning(body: &str) -> bool {
    ["reasoning", "thinking", "thought"]
        .iter()
        .any(|field| body.contains(field))
}

/// Whether the signed receipt text commits to this response body: `sha256(body)` in hex has to
/// appear in the text NEAR AI signed (§3.16, `resp_hash == sha256(response_body)`).
pub fn binds_body(text: &str, body: &str) -> bool {
    let hash = to_hex(&sha256(&[body.as_bytes()]));
    text.contains(&hash)
}

/// The bytes an Ethereum `personal_sign` signature covers:
/// `"\x19Ethereum Signed Message:\n" ‖ len ‖ text`. The contract hashes this with keccak-256 and
/// recovers the signer from it.
pub fn personal_sign_preimage(text: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"\x19Ethereum Signed Message:\n");
    bytes.extend_from_slice(itoa(text.len()).as_bytes());
    bytes.extend_from_slice(text.as_bytes());
    bytes
}

/// The decimal form of a length, without `std`'s formatting machinery.
fn itoa(mut n: usize) -> String {
    if n == 0 {
        return String::from("0");
    }
    let mut digits = Vec::new();
    while n > 0 {
        digits.push(b'0' + (n % 10) as u8);
        n /= 10;
    }
    digits.reverse();
    String::from_utf8(digits).expect("ascii digits")
}

/// The id of a receipt in the replay set: a receipt's text may be used once (§3.16).
pub fn receipt_id(text: &str) -> [u8; 32] {
    sha256(&[b"marginal/receipt/v1", text.as_bytes()])
}
