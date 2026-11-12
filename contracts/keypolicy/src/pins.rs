//! Seller pins (SDD §3.12.2): which rooms may get a listing's key. The path hash uses the caller's
//! own account, so only the seller can write the pins for a path derived from that seller.

use marginal_core::audit::AuditKind;
use marginal_core::json::parse_hex;
use marginal_core::keyrelease::{listing_key_id, PinMode};
use marginal_core::CoreError;
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{env, near};

use crate::fees::{charge, PINS_FEE};
use crate::store::{self, pin_id, Table};
use crate::{fail, KeyPolicy, KeyPolicyExt};

#[near]
impl KeyPolicy {
    /// Pins the rooms that may get key `version` of the caller's listing `listing_id`. `pins` is a
    /// list of measurement hashes (hex), or `null` to follow whatever governance approves. Costs
    /// [`PINS_FEE`]. A listing with no pins gets no key. Calling again replaces the pins.
    #[payable]
    pub fn set_pins(&mut self, listing_id: U64, version: u32, pins: Option<Vec<String>>) {
        charge(PINS_FEE);
        let mode = match pins {
            None => PinMode::FollowGovernance,
            Some(hashes) => PinMode::Explicit(
                hashes
                    .iter()
                    .map(|hash| parse_hex(hash).unwrap_or_else(|| fail(CoreError::Decode)))
                    .collect(),
            ),
        };
        mode.validate().unwrap_or_else(|e| fail(e));
        let seller = env::predecessor_account_id();
        let key_id = listing_key_id(&seller.to_string(), listing_id.0);
        store::put(Table::Pins, &pin_id(&key_id, version), &mode);
        self.emit(
            AuditKind::PinsSet,
            "pins_set",
            listing_id.0,
            json!({"seller": seller, "listing_id": listing_id.0, "version": version, "mode": mode}),
        );
    }
}
