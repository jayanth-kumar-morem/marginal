//! Key release (SDD §3.12.3): `authorize` turns a room's signed request into a ticket, and `derive`
//! spends the ticket on the MPC network. Nothing here can grant a key by itself: the room must be
//! attested, the seller must have pinned its measurement, the registry must still admit it, and
//! clearing must agree there is a job for it.

use marginal_core::audit::AuditKind;
use marginal_core::certificate::measurement_hash;
use marginal_core::codec::from_bytes;
use marginal_core::json::to_hex;
use marginal_core::keyrelease::{key_request_signing_bytes, parse_listing_path, KeyRequest};
use marginal_core::CoreError;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, Gas, NearToken};

use crate::calls::{self, Call};
use crate::fees::{charge, TICKET_FEE};
use crate::store::{self, pin_id, Attestation, Table, Ticket};
use crate::{fail, now_secs, KeyPolicy, KeyPolicyExt};

/// A ticket is good for 50 blocks.
pub const TICKET_TTL_BLOCKS: u64 = 50;
const CHECK_ROOM_GAS: Gas = Gas::from_tgas(10);
/// Clearing's `authorize_release` gets this much, and any gas left over.
const RELEASE_GAS: Gas = Gas::from_tgas(40);
const ON_AUTHORIZED_GAS: Gas = Gas::from_tgas(20);
/// The MPC call needs about 25 TGas; it is given 30 and any gas left over.
const MPC_GAS: Gas = Gas::from_tgas(30);
const ON_DERIVED_GAS: Gas = Gas::from_tgas(15);
const MAX_REPLY: usize = 4 * 1024;

/// The registry's answer to `check_room`. Only `ok` matters here.
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct RoomCheck {
    ok: bool,
}

/// The MPC network's answer: the derived key, encrypted to the room's app key.
#[near(serializers = [json])]
pub struct CkdResponse {
    pub big_y: String,
    pub big_c: String,
}

/// `"bls12381g1:" + base58(bytes)`, how the MPC contract writes a BLS key in JSON.
fn bls_key(curve: &str, bytes: &[u8]) -> String {
    format!("{curve}:{}", near_sdk::bs58::encode(bytes).into_string())
}

#[near]
impl KeyPolicy {
    /// Asks for a ticket. `request` is the Borsh of `marginal_core::keyrelease::KeyRequest` as base64
    /// and `room_sig` the room's ed25519 signature over `key_request_signing_bytes`. Costs
    /// [`TICKET_FEE`]. The result is the ticket id, once the registry and clearing have answered.
    #[payable]
    pub fn authorize(&mut self, request: Base64VecU8, room_sig: Base64VecU8) {
        charge(TICKET_FEE);
        let req: KeyRequest = from_bytes(&request.0).unwrap_or_else(|e| fail(e));
        if req.chain_id != self.chain_id || req.keypolicy != env::current_account_id().as_str() {
            fail(CoreError::Binding)
        }
        let signature: [u8; 64] = room_sig
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| fail(CoreError::BadSignature));
        if !env::ed25519_verify(&signature, key_request_signing_bytes(&req), &req.room_key) {
            fail(CoreError::BadSignature)
        }
        let room: Attestation = store::get(Table::Attestation, &req.room_key)
            .unwrap_or_else(|| fail(CoreError::AttestationExpired));
        if now_secs() >= room.expires_at {
            fail(CoreError::AttestationExpired)
        }
        let (key_id, version) = parse_listing_path(&req.path).unwrap_or_else(|e| fail(e));
        let pins: marginal_core::keyrelease::PinMode =
            store::get(Table::Pins, &pin_id(&key_id, version))
                .unwrap_or_else(|| fail(CoreError::NotPinned));
        if !pins.allows(&measurement_hash(&room.measurement)) {
            fail(CoreError::NotPinned)
        }

        let room_key = to_hex(&req.room_key);
        let check = calls::start(
            &self.registry,
            &Call::json(
                "check_room",
                &json!({ "room_key": room_key }),
                CHECK_ROOM_GAS,
                0,
            ),
        );
        let release_args = json!({
            "job_id": req.job_id,
            "room_key": room_key,
            "path_hash": to_hex(&marginal_core::keyrelease::path_hash(&req.path)),
            "job_commitment": to_hex(&req.job_commitment),
            "value_class": req.value_class,
        });
        let release = calls::start(
            &self.clearing,
            &Call::json("authorize_release", &release_args, RELEASE_GAS, 1),
        );
        let callback = Call::callback("on_authorized", "request", request.0, ON_AUTHORIZED_GAS);
        calls::return_value(calls::then(
            calls::both(check, release),
            &env::current_account_id(),
            &callback,
        ));
    }

    /// Both answers are in: the registry still admits the room and clearing authorised the release.
    #[private]
    pub fn on_authorized(&mut self, request: Base64VecU8) -> U64 {
        let req: KeyRequest = from_bytes(&request.0).expect("our own request");
        let check = env::promise_result_checked(0, MAX_REPLY)
            .unwrap_or_else(|_| fail(CoreError::RegistryUnavailable));
        let check: RoomCheck =
            serde_json::from_slice(&check).unwrap_or_else(|_| fail(CoreError::RegistryUnavailable));
        if !check.ok {
            fail(CoreError::RoomRevoked)
        }
        env::promise_result_checked(1, MAX_REPLY)
            .unwrap_or_else(|_| fail(CoreError::ReleaseDenied));

        let id = self.next_ticket;
        self.next_ticket += 1;
        store::put(
            Table::Ticket,
            &id.to_le_bytes(),
            &Ticket {
                room_key: req.room_key,
                path: req.path.clone(),
                app_key: req.app_key,
                job_id: req.job_id,
                job_commitment: req.job_commitment,
                expires_height: env::block_height() + TICKET_TTL_BLOCKS,
                used: false,
            },
        );
        self.emit(
            AuditKind::TicketIssued,
            "ticket_issued",
            id,
            json!({
                "ticket": id,
                "job_id": req.job_id,
                "room_key": to_hex(&req.room_key),
                "path_hash": to_hex(&marginal_core::keyrelease::path_hash(&req.path)),
                "job_commitment": to_hex(&req.job_commitment),
                "value_class": req.value_class,
            }),
        );
        U64(id)
    }

    /// Spends a ticket: asks the MPC network for the key at the ticket's path, encrypted to the
    /// room's app key. Anyone may call it, and the answer is useless to anyone but the room. Extra
    /// gas attached to the call goes to the MPC request.
    pub fn derive(&mut self, ticket_id: U64) {
        let ticket: Ticket = store::get(Table::Ticket, &ticket_id.0.to_le_bytes())
            .unwrap_or_else(|| fail(CoreError::Ticket));
        if ticket.used || env::block_height() > ticket.expires_height {
            fail(CoreError::Ticket)
        }
        let args = json!({"request": {
            "derivation_path": ticket.path,
            "app_public_key": {"AppPublicKeyPV": {
                "pk1": bls_key("bls12381g1", &ticket.app_key.pk1),
                "pk2": bls_key("bls12381g2", &ticket.app_key.pk2),
            }},
            "domain_id": self.ckd_domain_id,
        }});
        let mut request = Call::json("request_app_private_key", &args, MPC_GAS, 1);
        request.deposit = NearToken::from_yoctonear(1);
        let answer = calls::start(&self.mpc, &request);
        let callback = Call::json(
            "on_derived",
            &json!({ "ticket_id": ticket_id }),
            ON_DERIVED_GAS,
            0,
        );
        calls::return_value(calls::then(answer, &env::current_account_id(), &callback));
    }

    /// The MPC network answered. The ticket is spent only now, so a timeout can be retried until the
    /// ticket expires.
    #[private]
    pub fn on_derived(&mut self, ticket_id: U64) -> CkdResponse {
        let reply = env::promise_result_checked(0, MAX_REPLY)
            .unwrap_or_else(|_| fail(CoreError::DeriveFailed));
        let response: CkdResponse =
            serde_json::from_slice(&reply).unwrap_or_else(|_| fail(CoreError::DeriveFailed));
        let id = ticket_id.0.to_le_bytes();
        let mut ticket: Ticket =
            store::get(Table::Ticket, &id).expect("derive checked the ticket exists");
        if !ticket.used {
            ticket.used = true;
            store::put(Table::Ticket, &id, &ticket);
            self.emit(
                AuditKind::KeyDerived,
                "key_derived",
                ticket_id.0,
                json!({
                    "ticket": ticket_id.0,
                    "job_id": ticket.job_id,
                    "room_key": to_hex(&ticket.room_key),
                    "big_y": response.big_y,
                    "big_c": response.big_c,
                }),
            );
        }
        response
    }
}
