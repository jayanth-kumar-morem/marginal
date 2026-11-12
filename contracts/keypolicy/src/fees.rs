//! Storage is paid by whoever creates the record, so nobody can drain this contract by calling it
//! (it has no owner to top it up). Each fee covers the largest record its method can store: a test
//! stores that record and checks the fee against the storage it actually used. The fee is kept,
//! not refunded, so a caller should attach exactly the fee.

use marginal_core::CoreError;
use near_sdk::{env, NearToken};

use crate::fail;

pub const NONCE_FEE: NearToken = NearToken::from_millinear(2);
pub const ATTESTATION_FEE: NearToken = NearToken::from_millinear(10);
pub const PINS_FEE: NearToken = NearToken::from_millinear(10);
pub const TICKET_FEE: NearToken = NearToken::from_millinear(5);

/// Refuses the call unless at least `fee` is attached.
pub(crate) fn charge(fee: NearToken) {
    if env::attached_deposit() < fee {
        fail(CoreError::Deposit)
    }
}
