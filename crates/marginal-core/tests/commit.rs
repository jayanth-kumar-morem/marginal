//! E2.3: the job commitment and the salted good commitment.

use borsh::to_vec;
use marginal_core::commit::{good_commitment, job_commitment, JobCore, JOB_DOMAIN, SALT_LEN};
use marginal_core::*;
use sha2::{Digest, Sha256};

mod common;
use common::{assert_every_edit_changes_the_digest, h, job_core, Edit};

#[test]
fn job_commitment_is_sha256_of_the_domain_and_the_borsh_bytes() {
    for full in [false, true] {
        let core = job_core(full);
        let mut hasher = Sha256::new();
        hasher.update(b"marginal/job/v1");
        hasher.update(to_vec(&core).unwrap());
        let want: [u8; 32] = hasher.finalize().into();
        assert_eq!(job_commitment(&core), want);
    }
    assert_eq!(JOB_DOMAIN, b"marginal/job/v1");
}

/// A key release is bound to one job's exact parameters: changing any single field must change the
/// commitment, or a room could be tricked into releasing a key for a different job.
#[test]
fn every_field_is_bound() {
    let edits: Vec<Edit<JobCore>> = vec![
        ("chain_id", |c| c.chain_id = "mainnet".into()),
        ("clearing", |c| c.clearing = "other.testnet".into()),
        ("job_id", |c| c.job_id += 1),
        ("kind", |c| c.kind = JobKind::Screening),
        ("listing_id", |c| c.listing_id += 1),
        ("listing_version", |c| c.listing_version += 1),
        ("snapshot_id", |c| c.snapshot_id = None),
        ("snapshot_content_hash", |c| {
            c.snapshot_content_hash = Some(h(99))
        }),
        ("budget", |c| c.budget += 1),
        ("rule", |c| c.rule = PricingRule::Posted { ask: 1 }),
        ("formula_params", |c| c.formula_params.delta_star_bps += 1),
        ("mode", |c| c.mode = DisplayMode::Blind),
        ("privacy", |c| c.privacy = VerdictPrivacy::Sealed),
        ("disclosure_policy", |c| {
            c.disclosure_policy = DisclosurePolicy::AuditorEscrow
        }),
        ("max_debit_mbits", |c| c.max_debit_mbits += 1),
        ("delivery_pk", |c| c.delivery_pk[0] ^= 1),
        ("compliance_pk", |c| c.compliance_pk = None),
        ("context_auth_pk", |c| c.context_auth_pk[31] ^= 1),
        ("assigned_rooms", |c| c.assigned_rooms.reverse()),
        ("deadline_height", |c| c.deadline_height += 1),
    ];
    assert_every_edit_changes_the_digest(&job_core(true), &edits, job_commitment);
}

#[test]
fn good_commitment_is_sha256_of_salt_then_good() {
    let (salt, good) = ([7u8; SALT_LEN], b"canonical good".as_slice());
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(good);
    let want: [u8; 32] = hasher.finalize().into();
    assert_eq!(good_commitment(&salt, good), want);
    assert_eq!(SALT_LEN, 32);
}

#[test]
fn good_commitment_hides_the_good_behind_the_salt() {
    let good = b"the same good";
    assert_ne!(
        good_commitment(&[1; 32], good),
        good_commitment(&[2; 32], good),
        "a different salt"
    );
    assert_ne!(
        good_commitment(&[1; 32], good),
        good_commitment(&[1; 32], b"another good")
    );
    // An empty good is still committed.
    assert_eq!(
        good_commitment(&[1; 32], b""),
        Sha256::digest([1u8; 32]).as_slice()
    );
}
