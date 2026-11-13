//! The room-policy registry (SDD §3.11), a module inside clearing in M1: KeyPolicy is initialised
//! with `registry = clearing`, so its interface is the one §3.11 describes.
//!
//! The registry holds **policy** about rooms and verifies no quotes; KeyPolicy does that (§3.13) and
//! calls [`Clearing::admit_room`] with what it verified. Here a room is matched against the
//! measurement sets and platforms governance approved, and joins the pool for its class.
//!
//! M1 builds the grant side only. The deny-side methods (revoke a set, revoke a platform, freeze a
//! TCB, lower a cap, remove a room) and the time-lock are E16 and E19: no demo surface shows them
//! (`tasks.md`, "What M1 cuts").

use marginal_core::attest::{ppid_hash, AdmitRoom, MAX_ATTESTATION_SECS};
use marginal_core::audit::AuditKind;
use marginal_core::certificate::{measurement_hash, Measurement};
use marginal_core::json::{parse_hex, to_hex};
use marginal_core::{AttestationMode, CoreError, RoomClass};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::{from_value, json, Value};
use near_sdk::{env, near, require, AccountId};

use crate::fees::{charge, PLATFORM_FEE, SET_FEE};
use crate::store::{self, Table};
use crate::{fail, now_secs, Clearing, ClearingExt};

/// The most rooms one class pool holds. It bounds what `eligible` and every assignment read.
pub(crate) const MAX_POOL: usize = 32;

/// A set of measurements that are the same program (SDD §3.11). A room is admitted when its own
/// measurement is one of the members of an approved set.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub struct MeasurementSet {
    pub id: String,
    pub members: Vec<Measurement>,
    /// Git tag and commit the members were built from (SDD §3.11), for the demo README.
    pub source_tag: String,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct Platform {
    pub ppid_hash: [u8; 32],
    pub operator: AccountId,
    /// Value at risk allowed per epoch. M1 records it; the counters are E16.
    pub cap_per_epoch: u128,
}

/// What the registry keeps about an admitted room.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub(crate) struct RoomRecord {
    pub room_key: [u8; 32],
    pub box_pk: [u8; 32],
    pub ppid_hash: [u8; 32],
    pub measurement_set: String,
    pub class: RoomClass,
    pub mode: AttestationMode,
    pub registered_height: u64,
    /// Unix seconds: the earlier of KeyPolicy's expiry and 24 h from admission (SDD §3.11).
    pub expires_at: u64,
}

#[near]
impl Clearing {
    /// Approves a measurement set: the rooms that may run a listing's program. Each member is
    /// indexed by its measurement hash, so admission is a single lookup.
    ///
    /// `set` is Borsh of a `MeasurementSet`. Approving an id again replaces its members.
    #[payable]
    pub fn approve_measurement_set(&mut self, set: Base64VecU8) {
        self.only_gov();
        charge(SET_FEE);
        let set: MeasurementSet =
            near_sdk::borsh::from_slice(&set.0).unwrap_or_else(|_| fail(CoreError::Decode));
        require!(!set.id.is_empty(), "measurement set id");
        require!(!set.members.is_empty(), "measurement set members");
        for member in &set.members {
            store::put(
                Table::Measurement,
                &measurement_hash(member),
                &set.id.clone(),
            );
        }
        store::put(Table::MeasurementSet, set.id.as_bytes(), &set);
        self.policy_version += 1;
        self.emit(
            AuditKind::PolicyExecuted,
            "measurement_approved",
            self.policy_version,
            json!({
                "set": set.id,
                "members": set.members.len(),
                "source_tag": set.source_tag,
                "policy_version": self.policy_version,
            }),
        );
    }

    /// Admits a platform by its PPID, which is **exactly 16 bytes** (SDD §3.13: Phala's published
    /// list contains an empty entry, so a short or missing PPID must never match). It is stored
    /// hashed, the same way KeyPolicy records it.
    #[payable]
    pub fn admit_platform(&mut self, ppid: String, operator: AccountId, cap_per_epoch: U128) {
        self.only_gov();
        charge(PLATFORM_FEE);
        let ppid: Vec<u8> = parse_hex(&ppid).unwrap_or_else(|| fail(CoreError::Ppid));
        if ppid.len() != marginal_core::attest::PPID_LEN {
            fail(CoreError::Ppid)
        }
        let hash = ppid_hash(&ppid);
        store::put(
            Table::Platform,
            &hash,
            &Platform {
                ppid_hash: hash,
                operator: operator.clone(),
                cap_per_epoch: cap_per_epoch.0,
            },
        );
        self.policy_version += 1;
        self.emit(
            AuditKind::PolicyExecuted,
            "platform_admitted",
            self.policy_version,
            json!({
                "ppid_hash": to_hex(&hash),
                "operator": operator,
                "cap_per_epoch": cap_per_epoch,
                "policy_version": self.policy_version,
            }),
        );
    }

    /// KeyPolicy admits a room it has verified (SDD §3.11). Only KeyPolicy may call this: it is the
    /// only contract that checks a quote, and it attaches 1 yocto.
    ///
    /// The registry applies its own policy on top: the platform must be admitted and the room's
    /// measurement must belong to an approved set. The record expires at the earlier of KeyPolicy's
    /// own expiry and 24 h from now. Re-registration (a renewal) replaces the record in place.
    ///
    /// No storage fee: KeyPolicy attaches 1 yocto, the pool is capped, and only KeyPolicy can write
    /// here, so clearing's own balance covers a bounded number of rooms.
    #[payable]
    pub fn admit_room(&mut self, room: Value) {
        require!(
            env::predecessor_account_id() == self.keypolicy,
            "only keypolicy"
        );
        let room: AdmitRoom = from_value(room).unwrap_or_else(|_| fail(CoreError::Decode));
        if store::get::<Platform>(Table::Platform, &room.ppid_hash).is_none() {
            fail(CoreError::PlatformNotAdmitted)
        }
        let set: String = store::get(Table::Measurement, &measurement_hash(&room.measurement))
            .unwrap_or_else(|| fail(CoreError::MeasurementNotApproved));
        let expires_at = room.expires_at.min(now_secs() + MAX_ATTESTATION_SECS);
        store::put(
            Table::Room,
            &room.room_key,
            &RoomRecord {
                room_key: room.room_key,
                box_pk: room.box_pk,
                ppid_hash: room.ppid_hash,
                measurement_set: set.clone(),
                class: room.class,
                mode: room.attestation_mode,
                registered_height: room.registered_height,
                expires_at,
            },
        );
        self.join_pool(room.class, &room.room_key);
        self.emit(
            AuditKind::PolicyExecuted,
            "room_admitted",
            0,
            json!({
                "room_key": to_hex(&room.room_key),
                "measurement_set": set,
                "class": room.class,
                "mode": room.attestation_mode,
                "expires_at": expires_at,
            }),
        );
    }

    /// Deny-only input to KeyPolicy (SDD §3.12.5): `{ ok, deny_reasons }`. A room that is unknown,
    /// expired or on a platform that is no longer admitted gets no key.
    pub fn check_room(&self, room_key: String) -> Value {
        let mut deny: Vec<&str> = vec![];
        match self.room(&room_key) {
            None => deny.push("unknown"),
            Some(room) => {
                if room.expires_at <= now_secs() {
                    deny.push("expired");
                }
                if store::get::<Platform>(Table::Platform, &room.ppid_hash).is_none() {
                    deny.push("platform_not_admitted");
                }
            }
        }
        json!({ "ok": deny.is_empty(), "deny_reasons": deny })
    }

    /// The assignment pool for a class (SDD §3.11): every admitted room that is still current, minus
    /// the ones the caller excludes.
    pub fn eligible(&self, class: String, exclude: Option<Vec<String>>) -> Vec<String> {
        let class = parse_class(&class);
        let exclude = exclude.unwrap_or_default();
        self.pool(class)
            .into_iter()
            .filter(|key| {
                let hex = to_hex(key);
                !exclude.contains(&hex) && self.current(key)
            })
            .map(|key| to_hex(&key))
            .collect()
    }
}

/// A room class by its core name (`"K"`, `"Kcpu"`, `"S"`, `"G"`, `"D"`).
pub(crate) fn parse_class(class: &str) -> RoomClass {
    from_value(Value::String(class.to_string())).unwrap_or_else(|_| fail(CoreError::Decode))
}

impl Clearing {
    pub(crate) fn only_gov(&self) {
        require!(env::predecessor_account_id() == self.gov, "only gov");
    }

    pub(crate) fn room(&self, room_key: &str) -> Option<RoomRecord> {
        let key: [u8; 32] = parse_hex(room_key)?;
        store::get(Table::Room, &key)
    }

    /// Whether a room may be given work now: admitted, unexpired, platform still admitted.
    pub(crate) fn current(&self, room_key: &[u8; 32]) -> bool {
        match store::get::<RoomRecord>(Table::Room, room_key) {
            None => false,
            Some(room) => {
                room.expires_at > now_secs()
                    && store::get::<Platform>(Table::Platform, &room.ppid_hash).is_some()
            }
        }
    }

    pub(crate) fn pool(&self, class: RoomClass) -> Vec<[u8; 32]> {
        store::get(Table::Pool, &[class as u8]).unwrap_or_default()
    }

    /// Adds a room to its class pool, once. A full pool drops the rooms that are no longer current
    /// before refusing, so a dead room cannot hold a place forever.
    fn join_pool(&mut self, class: RoomClass, room_key: &[u8; 32]) {
        let mut pool = self.pool(class);
        if pool.contains(room_key) {
            return;
        }
        if pool.len() >= MAX_POOL {
            pool.retain(|key| self.current(key));
        }
        require!(pool.len() < MAX_POOL, "room pool is full");
        pool.push(*room_key);
        store::put(Table::Pool, &[class as u8], &pool);
    }
}
