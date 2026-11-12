//! Read-only views. Records come back in the JSON model of `marginal_core::json` (bytes as hex).

use marginal_core::certificate::measurement_hash;
use marginal_core::json::{parse_hex, to_hex};
use marginal_core::keyrelease::{listing_key_id, PinMode};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, to_value, Value};
use near_sdk::{near, AccountId};

use crate::fees::{ATTESTATION_FEE, NONCE_FEE, PINS_FEE, TICKET_FEE};
use crate::registration::NONCE_TTL_BLOCKS;
use crate::release::TICKET_TTL_BLOCKS;
use crate::store::{self, pin_id, Attestation, Table, Ticket};
use crate::{KeyPolicy, KeyPolicyExt, KEYPOLICY_VERSION};

/// Everything fixed at deployment, and the fees and lifetimes built into the code.
#[near(serializers = [json])]
pub struct KeyPolicyConfig {
    pub version: u8,
    pub chain_id: String,
    pub registry: AccountId,
    pub clearing: AccountId,
    pub mpc: AccountId,
    pub ckd_domain_id: u32,
    pub dcap_verifier: AccountId,
    pub nonce_ttl_blocks: u64,
    pub ticket_ttl_blocks: u64,
    pub nonce_fee: U128,
    pub attestation_fee: U128,
    pub pins_fee: U128,
    pub ticket_fee: U128,
}

#[near]
impl KeyPolicy {
    pub fn config(&self) -> KeyPolicyConfig {
        KeyPolicyConfig {
            version: KEYPOLICY_VERSION,
            chain_id: self.chain_id.clone(),
            registry: self.registry.clone(),
            clearing: self.clearing.clone(),
            mpc: self.mpc.clone(),
            ckd_domain_id: self.ckd_domain_id,
            dcap_verifier: self.dcap_verifier.clone(),
            nonce_ttl_blocks: NONCE_TTL_BLOCKS,
            ticket_ttl_blocks: TICKET_TTL_BLOCKS,
            nonce_fee: U128(NONCE_FEE.as_yoctonear()),
            attestation_fee: U128(ATTESTATION_FEE.as_yoctonear()),
            pins_fee: U128(PINS_FEE.as_yoctonear()),
            ticket_fee: U128(TICKET_FEE.as_yoctonear()),
        }
    }

    /// A room's attestation, by its signing key (hex).
    pub fn get_attestation(&self, room_key: String) -> Option<Value> {
        let key: [u8; 32] = parse_hex(&room_key)?;
        let a: Attestation = store::get(Table::Attestation, &key)?;
        Some(json!({
            "room_key": room_key,
            "box_pk": to_hex(&a.box_pk),
            "class": a.class,
            "ppid_hash": to_hex(&a.ppid_hash),
            "measurement": a.measurement,
            "measurement_hash": to_hex(&measurement_hash(&a.measurement)),
            "tcb_status": a.tcb_status,
            "tee_tcb_svn": to_hex(&a.tee_tcb_svn),
            "collateral_hash": to_hex(&a.collateral_hash),
            "quote_hash": to_hex(&a.quote_hash),
            "mode": a.mode,
            "verified_height": a.verified_height,
            "expires_at": a.expires_at,
        }))
    }

    /// The pins a seller set for one version of a listing.
    pub fn get_pins(&self, seller: AccountId, listing_id: U64, version: u32) -> Option<Value> {
        let key_id = listing_key_id(&seller.to_string(), listing_id.0);
        let mode: PinMode = store::get(Table::Pins, &pin_id(&key_id, version))?;
        Some(json!({"key_id": to_hex(&key_id), "mode": to_value(&mode).expect("json encodes")}))
    }

    pub fn get_ticket(&self, ticket_id: U64) -> Option<Value> {
        let t: Ticket = store::get(Table::Ticket, &ticket_id.0.to_le_bytes())?;
        Some(json!({
            "room_key": to_hex(&t.room_key),
            "path": t.path,
            "app_key": t.app_key,
            "job_id": t.job_id,
            "job_commitment": to_hex(&t.job_commitment),
            "expires_height": t.expires_height,
            "used": t.used,
        }))
    }

    /// The head of this contract's event chain and how many events it covers.
    pub fn audit_head(&self) -> Value {
        json!({"seq": self.audit_seq, "head": to_hex(&self.audit_head)})
    }
}
