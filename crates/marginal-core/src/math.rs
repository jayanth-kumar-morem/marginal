//! Exact integer arithmetic with a 256-bit intermediate. No floats anywhere in this crate: the
//! contract, the room (as wasm) and both verifiers must agree to the last unit.

use crate::error::CoreError;

const LOW64: u128 = u64::MAX as u128;

/// `a * b` as `(high, low)` 128-bit halves.
fn widening_mul(a: u128, b: u128) -> (u128, u128) {
    let (a0, a1) = (a & LOW64, a >> 64);
    let (b0, b1) = (b & LOW64, b >> 64);
    let (p00, p01, p10, p11) = (a0 * b0, a0 * b1, a1 * b0, a1 * b1);
    let mid = (p00 >> 64) + (p01 & LOW64) + (p10 & LOW64); // at most 3 * (2^64 - 1)
    let lo = (p00 & LOW64) | (mid << 64); // `mid << 64` drops the carry, which goes to `hi`
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64); // < 2^128 because a * b < 2^256
    (hi, lo)
}

/// `floor(a * b / d)`, computed without overflow in the product.
///
/// Errors with [`CoreError::Arithmetic`] if `d == 0` or the result does not fit in a `u128`.
pub fn mul_div(a: u128, b: u128, d: u128) -> Result<u128, CoreError> {
    if d == 0 {
        return Err(CoreError::Arithmetic);
    }
    let (hi, lo) = widening_mul(a, b);
    if hi == 0 {
        return Ok(lo / d);
    }
    // The quotient is below 2^128 exactly when hi < d.
    if hi >= d {
        return Err(CoreError::Arithmetic);
    }
    // Binary long division of the 256-bit value (hi:lo) by d. Invariant: rem < d.
    let (mut rem, mut quotient) = (hi, 0u128);
    for i in (0..128).rev() {
        let carry = rem >> 127; // rem * 2 may reach 2^128
        rem = (rem << 1) | ((lo >> i) & 1);
        quotient <<= 1;
        if carry == 1 || rem >= d {
            rem = rem.wrapping_sub(d); // exact: the true value is below d
            quotient |= 1;
        }
    }
    Ok(quotient)
}

/// `floor(a * b / d)` for `u32` operands (basis-point arithmetic).
pub fn mul_div_u32(a: u32, b: u32, d: u32) -> Result<u32, CoreError> {
    if d == 0 {
        return Err(CoreError::Arithmetic);
    }
    u32::try_from(u64::from(a) * u64::from(b) / u64::from(d)).map_err(|_| CoreError::Arithmetic)
}
