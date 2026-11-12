//! Simulated rooms, for contract tests only (SDD §3.13, §6.1). Built only with `sim-attestation`,
//! deployed as `keypolicy-sim`, and every record it makes says `Simulated`. The feature cannot be
//! combined with `mainnet` (a `compile_error!` in `lib.rs`), and the default build has no such method.

use marginal_core::attest::{Attested, SimRoom, MAX_ATTESTATION_SECS};
use marginal_core::codec::from_bytes;
use marginal_core::AttestationMode;
use near_sdk::json_types::Base64VecU8;
use near_sdk::near;

use crate::calls;
use crate::fees::{charge, ATTESTATION_FEE};
use crate::registration::{spend_nonce, NewRoom};
use crate::{fail, now_secs, KeyPolicy, KeyPolicyExt};

#[near]
impl KeyPolicy {
    /// Registers a room with no quote. `request` is the Borsh of `marginal_core::attest::SimRoom`, as base64.
    #[payable]
    pub fn register_room_simulated(&mut self, request: Base64VecU8) {
        charge(ATTESTATION_FEE);
        let room: SimRoom = from_bytes(&request.0).unwrap_or_else(|e| fail(e));
        spend_nonce(&room.nonce);
        let admit = self.record_room(NewRoom {
            sign_pk: room.sign_pk,
            box_pk: room.box_pk,
            class: room.class,
            attested: Attested {
                measurement: room.measurement,
                ppid_hash: room.ppid_hash,
                tcb_status: "Simulated".into(),
                tee_tcb_svn: [0; 16],
                expires_at: now_secs() + MAX_ATTESTATION_SECS,
                collateral_issued_at: now_secs(),
            },
            quote_hash: [0; 32],
            collateral_hash: [0; 32],
            mode: AttestationMode::Simulated,
        });
        calls::return_value(admit);
    }
}
