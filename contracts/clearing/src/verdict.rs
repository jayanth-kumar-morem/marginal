//! `submit_verdict` in Open mode (SDD §3.17, AC-1, AC-25) and the judge receipts behind it (§3.16).
//!
//! A relayer sends the call, so the room's signature is the authority. Clearing checks it, checks
//! every binding, then **recomputes the price itself** with `marginal-core` from the published
//! components and factors: the room's own numbers are never taken on trust. In Sealed mode it
//! cannot see them at all, so a Groth16 proof stands in for the recompute (§3.17, E10.2) — and
//! clearing still decides every public input itself.

use marginal_core::audit::AuditKind;
use marginal_core::groth16::{commitment_limbs, u128_le, u32_le};
use marginal_core::json::to_hex;
use marginal_core::judge::{binds_body, parse_relevance, personal_sign_preimage, receipt_id};
use marginal_core::pricing::{apply_rule, measured_index, RuleOutcome};
use marginal_core::verdict::{
    verdict_signing_bytes, JudgeFactor, ModelProof, VerdictStatus, VerdictV1,
};
use marginal_core::{
    CoreError, Job, JobState, Listing, Outcome, PricingRule, VerdictPrivacy, SIM_ATTESTATION,
    SIM_JUDGE,
};
use marginal_groth16::{verify, PreparedKey};
use near_sdk::borsh::from_slice;
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near};

use crate::gov::AiSigner;
use crate::store::{self, num, Table};
use crate::{fail, Clearing, ClearingExt};

/// What the room told clearing, once clearing has checked it and worked out the price itself.
pub(crate) struct Checked {
    pub outcome: Outcome,
    /// The state the job ends in, from core's outcome table.
    pub ends_in: marginal_core::JobState,
    pub price: u128,
    /// Sealed mode only (SDD §3.3): the commitment the proof was checked against, which is what a
    /// later opening is replayed against. Open mode publishes the components themselves.
    pub components_commitment: Option<[u8; 32]>,
    pub simulated_flags: u8,
    /// The receipts this verdict used. They enter the replay set only if it is accepted: a
    /// rejected verdict must leave no trace, or a room could never fix one and try again.
    pub receipts: Vec<[u8; 32]>,
}

#[near]
impl Clearing {
    /// The room reports what it found. `verdict` is Borsh of a core `VerdictV1` and `sig` the
    /// room's ed25519 signature over its signing bytes.
    ///
    /// A verdict that does not check out emits `verdict_rejected` and **leaves the job open**, so
    /// the room can try again until the deadline; only an accepted verdict settles (SDD §3.17).
    pub fn submit_verdict(&mut self, verdict: Base64VecU8, sig: Base64VecU8) -> Value {
        let verdict: VerdictV1 = from_slice(&verdict.0).unwrap_or_else(|_| fail(CoreError::Decode));
        let job: Job =
            store::get(Table::Job, &num(verdict.job_id)).unwrap_or_else(|| fail(CoreError::Ticket));
        self.check_verdict_binding(&verdict, &job);
        self.verify_verdict_signature(&verdict, &sig, &job);

        let listing = self.listing(job.listing_id);
        match self.check_verdict(&verdict, &job, &listing) {
            Err(reason) => {
                self.emit(
                    AuditKind::VerdictRejected,
                    "verdict_rejected",
                    job.id,
                    json!({
                        "job_id": job.id,
                        "room_key": to_hex(&verdict.room_key),
                        "reason": reason.code(),
                    }),
                );
                json!({ "status": "Rejected", "reason": reason.code() })
            }
            Ok(checked) => {
                for id in &checked.receipts {
                    store::put(Table::Receipt, id, &true);
                }
                self.emit(
                    AuditKind::VerdictAccepted,
                    "verdict_accepted",
                    job.id,
                    json!({
                        "job_id": job.id,
                        "room_key": to_hex(&verdict.room_key),
                        "outcome": format!("{:?}", checked.outcome),
                        "price": near_sdk::json_types::U128(checked.price),
                        "cert_hash": to_hex(&verdict.cert_hash),
                        "simulated_flags": checked.simulated_flags,
                    }),
                );
                self.settle_job(job, listing, &verdict, checked)
            }
        }
    }
}

impl Clearing {
    /// The bindings a verdict must carry (SDD §3.17): this chain, this contract, this job, this
    /// listing version, and the commitment the job was created with.
    fn check_verdict_binding(&self, verdict: &VerdictV1, job: &Job) {
        if verdict.domain != VerdictV1::DOMAIN
            || verdict.chain_id != self.chain_id
            || verdict.clearing != env::current_account_id().as_str()
            || verdict.listing_id != job.listing_id
            || verdict.listing_version != job.listing_version
        {
            fail(CoreError::Binding)
        }
        if verdict.job_commitment != job.job_commitment {
            fail(CoreError::CommitmentMismatch)
        }
    }

    /// The room must be the one this job was given to, still current, and must have signed.
    fn verify_verdict_signature(&self, verdict: &VerdictV1, sig: &Base64VecU8, job: &Job) {
        if job.state != JobState::Computing {
            fail(CoreError::JobStateInvalid)
        }
        if !job.assigned.contains(&verdict.room_key) {
            fail(CoreError::RoomNotAssigned)
        }
        if !self.current(&verdict.room_key) {
            fail(CoreError::RoomRevoked)
        }
        let signature: [u8; 64] = sig
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| fail(CoreError::BadSignature));
        let message = verdict_signing_bytes(verdict);
        if !env::ed25519_verify(&signature, &message, &verdict.room_key) {
            fail(CoreError::BadSignature)
        }
    }

    /// A Sealed verdict (SDD §3.17, D10): the scores stay in the room and a Groth16 proof says the
    /// price follows from them.
    ///
    /// Clearing checks nothing about the measurement itself — it cannot, that is the point — but it
    /// does decide every public input itself, from the job and the listing, rather than taking them
    /// from the verdict. The only values the room contributes are the commitment, the outcome and
    /// the price, and the proof is what ties those to scores in range under the right formula.
    ///
    /// Judge provenance is **not** checked here. In Sealed mode the attested room checks the
    /// receipts and the opening can be re-checked later (§3.17); on chain there is nothing to see.
    fn check_sealed(
        &self,
        verdict: &VerdictV1,
        job: &Job,
        listing: &Listing,
    ) -> Result<Checked, CoreError> {
        if verdict.open.is_some() {
            return Err(CoreError::Schema);
        }
        let mut simulated_flags = 0u8;
        if self.attestation_is_simulated(&verdict.room_key) {
            simulated_flags |= SIM_ATTESTATION;
        }
        // A Sealed job can still end without a price. A restricted good or an input the appraiser
        // cannot read has nothing to prove, so the room sends the status alone, with no body and no
        // proof, and the job ends there — otherwise such a job could only ever time out (§3.17).
        let unpriced = match verdict.status {
            VerdictStatus::Ok => None,
            VerdictStatus::Restricted => Some(Outcome::Restricted),
            VerdictStatus::InputRejected | VerdictStatus::InputError => {
                Some(Outcome::InputRejected)
            }
            VerdictStatus::SchemaFailure => return Err(CoreError::Schema),
        };
        if let Some(outcome) = unpriced {
            if verdict.sealed.is_some() {
                return Err(CoreError::Schema);
            }
            return self.accepted(outcome, 0, simulated_flags, Vec::new(), verdict);
        }
        if self.verifying_key.is_empty() {
            return Err(CoreError::ProofDisabled);
        }
        let body = verdict.sealed.as_ref().ok_or(CoreError::Schema)?;
        if !body.shown.is_empty() {
            return Err(CoreError::DisplayDisabled);
        }
        // One verifying key, one rule: R1. Another rule would need its own key (§3.17).
        let PricingRule::Posted { ask } = listing.rule else {
            return Err(CoreError::RuleDisabled);
        };
        let outcome_bit = match body.outcome {
            Outcome::Deal => 1u32,
            Outcome::NoDeal => 0u32,
            // The circuit proves one bit, so a body can only say deal or no deal. Everything else
            // is an unpriced status, handled above.
            _ => return Err(CoreError::Schema),
        };

        let (hi, lo) = commitment_limbs(&job.job_commitment);
        let inputs = [
            hi,
            lo,
            u128_le(job.buckets.budget),
            u128_le(ask),
            u32_le(listing.l_floor_bps),
            u32_le(outcome_bit),
            u128_le(body.price),
            body.commitment,
        ];
        let key = PreparedKey::parse(&self.verifying_key)?;
        if !verify(&key, &body.proof, &inputs)? {
            return Err(CoreError::ProofInvalid);
        }

        if body.outcome == Outcome::Deal && verdict.delivery_commitment.is_none() {
            return Err(CoreError::DeliveryMissing);
        }
        let mut checked = self.accepted(
            body.outcome,
            body.price,
            simulated_flags,
            Vec::new(),
            verdict,
        )?;
        checked.components_commitment = Some(body.commitment);
        Ok(checked)
    }

    /// Everything that can make clearing refuse a signed verdict without the job ending. Each
    /// refusal is a stable code the room can act on.
    fn check_verdict(
        &self,
        verdict: &VerdictV1,
        job: &Job,
        listing: &Listing,
    ) -> Result<Checked, CoreError> {
        // The buyer chose the mode at request time and it is bound into `job_commitment`, so a
        // room cannot answer a Sealed job with an Open verdict or the other way round.
        if verdict.privacy != job.privacy {
            return Err(CoreError::Schema);
        }
        if verdict.appraiser != listing.appraiser {
            return Err(CoreError::Schema);
        }
        if job.privacy == VerdictPrivacy::Sealed {
            return self.check_sealed(verdict, job, listing);
        }
        let body = verdict.open.as_ref().ok_or(CoreError::Schema)?;
        if verdict.sealed.is_some() {
            return Err(CoreError::Schema);
        }
        // M1 shows no fields (`DisplayMode::Blind`), so a verdict that shows any is malformed.
        if !body.shown.is_empty() {
            return Err(CoreError::DisplayDisabled);
        }

        // Every judge receipt, in order, and the flags that say what was simulated.
        let mut simulated_flags = 0u8;
        if self.attestation_is_simulated(&verdict.room_key) {
            simulated_flags |= SIM_ATTESTATION;
        }
        let mut factors = Vec::with_capacity(body.factors.len());
        let mut receipts: Vec<[u8; 32]> = Vec::new();
        for factor in &body.factors {
            let (checked, simulated, receipt) = self.check_judge(factor, &receipts)?;
            factors.push(checked);
            if simulated {
                simulated_flags |= SIM_JUDGE;
            }
            if let Some(id) = receipt {
                receipts.push(id);
            }
        }

        // The price clearing works out itself, from the published numbers (AC-1, §3.7).
        let outcome = match verdict.status {
            VerdictStatus::Ok => {
                let m = measured_index(
                    listing.appraiser.formula_id,
                    &body.components,
                    &marginal_core::FormulaParams::default(),
                    listing.l_floor_bps,
                    &factors,
                )?;
                match apply_rule(&listing.rule, job.buckets.budget, m)? {
                    RuleOutcome::Deal { price } => {
                        // A deal must say where the good went, and every verdict carries its
                        // certificate (§3.18).
                        if verdict.delivery_commitment.is_none() {
                            return Err(CoreError::DeliveryMissing);
                        }
                        return self.accepted(
                            Outcome::Deal,
                            price,
                            simulated_flags,
                            receipts,
                            verdict,
                        );
                    }
                    RuleOutcome::NoDeal => Outcome::NoDeal,
                }
            }
            VerdictStatus::Restricted => Outcome::Restricted,
            VerdictStatus::InputRejected | VerdictStatus::InputError => Outcome::InputRejected,
            VerdictStatus::SchemaFailure => return Err(CoreError::Schema),
        };
        self.accepted(outcome, 0, simulated_flags, receipts, verdict)
    }

    /// Common tail of every accepted verdict: the certificate has to be there.
    fn accepted(
        &self,
        outcome: Outcome,
        price: u128,
        simulated_flags: u8,
        receipts: Vec<[u8; 32]>,
        verdict: &VerdictV1,
    ) -> Result<Checked, CoreError> {
        if verdict.cert_hash == [0; 32] {
            return Err(CoreError::CertMissing);
        }
        Ok(Checked {
            outcome,
            // `accepted` is only reached with an outcome settlement can produce.
            ends_in: marginal_core::settle::state_for(outcome)
                .expect("a settleable outcome has an end state"),
            price,
            components_commitment: None,
            simulated_flags,
            receipts,
        })
    }

    /// One judge's receipt (SDD §3.16, AC-25). Returns the factor clearing will use and whether the
    /// judge was simulated.
    fn check_judge(
        &self,
        factor: &JudgeFactor,
        used_here: &[[u8; 32]],
    ) -> Result<(u32, bool, Option<[u8; 32]>), CoreError> {
        match &factor.proof {
            // The weights are part of the room's measurement, which the registry already approved.
            ModelProof::WeightsInMeasurement { .. } => Ok((factor.factor_bps, false, None)),
            // Flagged on chain and worth nothing it did not earn: a simulated judge cannot raise a
            // price, so its factor is pinned to the floor (0 resolves to `l_floor`).
            ModelProof::Simulated { .. } => Ok((0, true, None)),
            ModelProof::NearAiReceipt {
                text,
                sig65,
                response_body,
            } => {
                let signer: AiSigner = self
                    .recover_signer(text, sig65)
                    .and_then(|address| store::get(Table::Signer, &address))
                    .ok_or(CoreError::ReceiptSigner)?;
                if signer.expires_at <= crate::now_secs() {
                    return Err(CoreError::ReceiptSigner);
                }
                if signer.model != factor.model_id {
                    return Err(CoreError::ModelNotAllowed);
                }
                if !binds_body(text, response_body) {
                    return Err(CoreError::ReceiptBodyHash);
                }
                // Used before, in an earlier job or twice in this one.
                let id = receipt_id(text);
                if store::get::<bool>(Table::Receipt, &id).is_some() || used_here.contains(&id) {
                    return Err(CoreError::ReceiptReplay);
                }
                // The strict parse is the whole rule: a body is only worth something if it is
                // exactly `{"relevance":k}`, so a body carrying reasoning (DR-13) scores zero by
                // the same token. `judge::has_reasoning` states that rule for the room, which must
                // not publish such a body at all.
                let scored = parse_relevance(response_body);
                if scored != factor.factor_bps {
                    return Err(CoreError::RecomputeMismatch);
                }
                Ok((scored, false, Some(id)))
            }
        }
    }

    /// The Ethereum address that signed a receipt, from its 65-byte signature.
    fn recover_signer(&self, text: &str, sig65: &[u8; 65]) -> Option<[u8; 20]> {
        let hash = env::keccak256_array(&personal_sign_preimage(text)[..]);
        let v = sig65[64];
        // Accept both the raw recovery id and the Ethereum `v` (27 or 28).
        let recovery = if v >= 27 { v - 27 } else { v };
        // The host function *aborts* on a recovery byte outside 0..=3, which would kill the whole
        // call instead of rejecting one receipt, so it is checked here first.
        if recovery > 3 {
            return None;
        }
        let key = env::ecrecover(&hash, &sig65[..64], recovery, true)?;
        let digest = env::keccak256_array(&key[..]);
        Some(digest[12..].try_into().expect("20 bytes"))
    }

    /// Whether the room that signed was registered under a simulated attestation (§6.3 rule 2: a
    /// record always says which toggles produced it).
    fn attestation_is_simulated(&self, room_key: &[u8; 32]) -> bool {
        self.room(&to_hex(room_key))
            .map(|room| room.mode != marginal_core::AttestationMode::OnChainDcap)
            .unwrap_or(false)
    }
}
