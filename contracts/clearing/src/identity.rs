//! Nullifiers (SDD §3.20, AC-14). One verified identity gets one appraisal per listing per epoch,
//! across every account it controls, and the identity itself never reaches the chain: clearing only
//! ever sees an opaque 32-byte nullifier the compliance service computed.
//!
//! M1 builds this and nothing else from §3.20: identity tiers, anonymity sets and payout approvals
//! are E16 and E18 (`tasks.md`, "What M1 cuts").

use marginal_core::codec::sha256;
use marginal_core::credential::{nullifier_signing_bytes, NullifierCredential};
use marginal_core::CoreError;
use near_sdk::json_types::U64;
use near_sdk::{env, near, AccountId};

use crate::store::{self, nullifier_id, Table};
use crate::{fail, Clearing, ClearingExt};

#[near]
impl Clearing {
    /// Whether a nullifier has already bought this listing in this epoch (AC-14). The SDK checks it
    /// before a buyer spends gas on a request that could only be refused.
    pub fn is_nullifier_used(&self, listing_id: U64, epoch: u32, nullifier: String) -> bool {
        let Some(nullifier) = marginal_core::json::parse_hex::<[u8; 32]>(&nullifier) else {
            return false;
        };
        store::get::<bool>(
            Table::Nullifier,
            &nullifier_id(listing_id.0, epoch, &nullifier),
        )
        .is_some()
    }
}

impl Clearing {
    /// Checks a nullifier credential and spends it. The credential must be signed by the issuer
    /// governance registered, be unexpired, name this chain, this contract, this listing and the
    /// account presenting it, and its nullifier must not have been used for this listing and epoch.
    pub(crate) fn spend_nullifier(
        &mut self,
        credential: &NullifierCredential,
        signature: &[u8; 64],
        subject: &AccountId,
        listing_id: u64,
    ) {
        let issuer = self
            .issuer_key
            .unwrap_or_else(|| fail(CoreError::CredentialInvalid));
        if credential.domain != NullifierCredential::DOMAIN
            || credential.chain_id != self.chain_id
            || credential.clearing != env::current_account_id().as_str()
            || credential.subject != subject.as_str()
            || credential.listing_id != listing_id
        {
            fail(CoreError::Binding)
        }
        if credential.expiry_height < env::block_height() {
            fail(CoreError::CredentialInvalid)
        }
        if !env::ed25519_verify(signature, &nullifier_signing_bytes(credential)[..], &issuer) {
            fail(CoreError::CredentialInvalid)
        }
        let id = nullifier_id(listing_id, credential.epoch, &credential.nullifier);
        if store::get::<bool>(Table::Nullifier, &id).is_some() {
            fail(CoreError::NullifierUsed)
        }
        store::put(Table::Nullifier, &id, &true);
    }

    /// The hash recorded in the event, so an auditor can match a job to its nullifier without the
    /// nullifier itself appearing twice on chain.
    pub(crate) fn nullifier_tag(nullifier: &[u8; 32]) -> [u8; 32] {
        sha256(&[b"marginal/nullifier-tag/v1", nullifier])
    }
}
