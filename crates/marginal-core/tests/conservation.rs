//! E2.3: AC-4. No unit of a job's escrow appears or disappears.

use marginal_core::conservation::check_conservation;
use marginal_core::{Buckets, CoreError};
use proptest::prelude::*;

fn buckets(v: [u128; 7]) -> Buckets {
    Buckets {
        budget: v[0],
        compute: v[1],
        comp_reserved: v[2],
        fee_reserved: v[3],
        storage: v[4],
        held: v[5],
        refund: v[6],
    }
}

#[test]
fn a_job_at_request_time() {
    // B + compute + comp_reserved + fee_reserved + storage, and nothing has moved out yet.
    let b = Buckets {
        budget: 1_000_000_000,
        compute: 5,
        comp_reserved: 7,
        fee_reserved: 11,
        storage: 13,
        ..Default::default()
    };
    let deposit = 1_000_000_000 + 5 + 7 + 11 + 13;
    assert_eq!(b.total(), Ok(deposit));
    assert_eq!(check_conservation(deposit, &b, 0), Ok(()));
}

#[test]
fn a_settled_deal_after_part_of_it_was_paid_out() {
    // price 400 moved to `held`, compute 5 and comp 7 were credited out, 590 refunded, fee 11 and storage 13 stay.
    let b = Buckets {
        held: 400,
        refund: 590,
        fee_reserved: 11,
        storage: 13,
        ..Default::default()
    };
    assert_eq!(check_conservation(1_026, &b, 12), Ok(()));
    assert_eq!(
        check_conservation(1_026, &b, 11),
        Err(CoreError::Conservation),
        "a unit went missing"
    );
    assert_eq!(
        check_conservation(1_026, &b, 13),
        Err(CoreError::Conservation),
        "a unit appeared"
    );
}

#[test]
fn nothing_is_ever_wrapped() {
    let full = Buckets {
        budget: u128::MAX,
        ..Default::default()
    };
    assert_eq!(full.total(), Ok(u128::MAX));
    assert_eq!(check_conservation(u128::MAX, &full, 0), Ok(()));
    assert_eq!(
        check_conservation(u128::MAX, &full, 1),
        Err(CoreError::Arithmetic),
        "moved_out pushes the sum over"
    );
    let over = Buckets {
        budget: u128::MAX,
        refund: 1,
        ..Default::default()
    };
    assert_eq!(over.total(), Err(CoreError::Arithmetic));
    assert_eq!(check_conservation(0, &over, 0), Err(CoreError::Arithmetic));
}

proptest! {
    /// Split any deposit into the seven buckets plus what moved out, any way at all: it conserves.
    /// Move one unit anywhere (create or destroy it): it does not.
    #[test]
    fn exactly_the_deposit_conserves(parts in prop::array::uniform8(0u128..=(u128::MAX / 8)), which in 0usize..8, grow in any::<bool>()) {
        let deposit: u128 = parts.iter().sum();
        let b = buckets(parts[..7].try_into().unwrap());
        let moved_out = parts[7];
        prop_assert_eq!(check_conservation(deposit, &b, moved_out), Ok(()));

        let mut broken = parts;
        if grow || broken[which] == 0 {
            broken[which] += 1;
        } else {
            broken[which] -= 1;
        }
        let b2 = buckets(broken[..7].try_into().unwrap());
        prop_assert_eq!(check_conservation(deposit, &b2, broken[7]), Err(CoreError::Conservation));
    }

    /// Moving value between buckets never changes the total.
    #[test]
    fn moving_value_between_buckets_keeps_the_total(parts in prop::array::uniform7(0u128..=(u128::MAX / 8)), from in 0usize..7, to in 0usize..7, cut in any::<u128>()) {
        let before = buckets(parts);
        let amount = cut % (parts[from] + 1);
        let mut moved = parts;
        moved[from] -= amount;
        moved[to] += amount;
        prop_assert_eq!(buckets(moved).total(), before.total());
    }
}
