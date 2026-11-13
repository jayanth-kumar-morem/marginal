//! Storage is paid by whoever creates the record (SDD §3.3). Clearing has no owner to top it up, so
//! every method that writes a record charges at least what that record's storage costs. Each fee is
//! checked against the storage its own method actually uses, in `tests/fees.rs`.

use marginal_core::CoreError;
use near_sdk::{env, NearToken};

use crate::fail;

pub const LISTING_FEE: NearToken = NearToken::from_millinear(30);
pub const PUBLISH_FEE: NearToken = NearToken::from_millinear(20);
pub const SNAPSHOT_FEE: NearToken = NearToken::from_millinear(10);
pub const SET_FEE: NearToken = NearToken::from_millinear(20);
pub const PLATFORM_FEE: NearToken = NearToken::from_millinear(10);
pub const ROOM_FEE: NearToken = NearToken::from_millinear(10);

/// Refuses the call unless at least `fee` is attached.
pub(crate) fn charge(fee: NearToken) {
    if env::attached_deposit() < fee {
        fail(CoreError::Deposit)
    }
}
