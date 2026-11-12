//! `mul_div` against an exact big-integer oracle, including the edges where the 256-bit
//! intermediate matters. Run with `PROPTEST_CASES=1000000` (`make props`) for the full sweep.

use marginal_core::math::{mul_div, mul_div_u32};
use marginal_core::CoreError;
use num_bigint::BigUint;
use proptest::prelude::*;

fn oracle(a: u128, b: u128, d: u128) -> Result<u128, CoreError> {
    if d == 0 {
        return Err(CoreError::Arithmetic);
    }
    let q = BigUint::from(a) * BigUint::from(b) / BigUint::from(d);
    u128::try_from(q).map_err(|_| CoreError::Arithmetic)
}

/// Mostly arbitrary values, with the awkward ones over-represented.
fn wide() -> impl Strategy<Value = u128> {
    prop_oneof![
        4 => any::<u128>(),
        1 => Just(0u128),
        1 => Just(1u128),
        1 => Just(u128::MAX),
        1 => Just(u128::MAX - 1),
        1 => Just(1u128 << 64),
        1 => Just((1u128 << 64) - 1),
        1 => Just((1u128 << 64) + 1),
        1 => Just(1u128 << 127),
        1 => Just((1u128 << 127) - 1),
        1 => Just((1u128 << 127) + 1),
        1 => (0u32..128).prop_map(|s| 1u128 << s),
    ]
}

proptest! {
    #[test]
    fn mul_div_matches_the_oracle(a in wide(), b in wide(), d in wide()) {
        prop_assert_eq!(mul_div(a, b, d), oracle(a, b, d));
    }

    /// The case clearing uses: `budget * m / 10_000` never overflows.
    #[test]
    fn mul_div_by_bps_is_exact(a in any::<u128>(), m in 0u128..=10_000) {
        let v = mul_div(a, m, 10_000).unwrap();
        prop_assert_eq!(Ok(v), oracle(a, m, 10_000));
        prop_assert!(v <= a);
    }

    #[test]
    fn mul_div_u32_matches_the_oracle(a in any::<u32>(), b in any::<u32>(), d in any::<u32>()) {
        let want = oracle(a.into(), b.into(), d.into()).and_then(|q| u32::try_from(q).map_err(|_| CoreError::Arithmetic));
        prop_assert_eq!(mul_div_u32(a, b, d), want);
    }
}

#[test]
fn fixed_cases() {
    assert_eq!(mul_div(10, 3, 4), Ok(7));
    assert_eq!(mul_div(0, u128::MAX, 1), Ok(0));
    assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), Ok(u128::MAX));
    assert_eq!(mul_div(u128::MAX, 2, 2), Ok(u128::MAX));
    assert_eq!(mul_div(1, 1, 0), Err(CoreError::Arithmetic));
    assert_eq!(
        mul_div(u128::MAX, 2, 1),
        Err(CoreError::Arithmetic),
        "result above u128::MAX"
    );
    assert_eq!(mul_div(1 << 100, 1 << 100, 1 << 100), Ok(1 << 100));
    assert_eq!(
        mul_div_u32(u32::MAX, u32::MAX, 1),
        Err(CoreError::Arithmetic)
    );
    assert_eq!(mul_div_u32(7, 7, 0), Err(CoreError::Arithmetic));
}
