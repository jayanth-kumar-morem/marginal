//! The Borsh types spoken at NEAR One's `tee-verifier` contract (SDD §3.13), mirrored field for
//! field from near/mpc `crates/tee-verifier-interface` at tag 3.19.0. The verifier owns this wire
//! layout, so a mirror here is safe, and it keeps `dcap-qvl` out of KeyPolicy.
//!
//! The layout was checked against the live testnet verifier (`tee-verifier-2026-11-02.testnet`): a
//! real `Verified` reply decodes with this module and no bytes left over
//! (`fixtures/tee-verifier-reply.borsh`, `tests/verifier.rs`).

use alloc::string::String;
use alloc::vec::Vec;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::json::hex;

/// Quote collateral, as the verifier takes it. JSON model: strings as they are, bytes as hex.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Collateral {
    pub pck_crl_issuer_chain: String,
    #[serde(with = "hex")]
    pub root_ca_crl: Vec<u8>,
    #[serde(with = "hex")]
    pub pck_crl: Vec<u8>,
    pub tcb_info_issuer_chain: String,
    pub tcb_info: String,
    #[serde(with = "hex")]
    pub tcb_info_signature: Vec<u8>,
    pub qe_identity_issuer_chain: String,
    pub qe_identity: String,
    #[serde(with = "hex")]
    pub qe_identity_signature: Vec<u8>,
    pub pck_certificate_chain: Option<String>,
}

/// The arguments of `verify_quote_with_collateral_dates`: Borsh of the quote bytes, then of the
/// collateral. Two `#[serializer(borsh)]` arguments encode as exactly this concatenation.
pub fn verify_args(quote: &[u8], collateral: &Collateral) -> Vec<u8> {
    let mut args = crate::codec::to_bytes(&quote.to_vec());
    args.extend(crate::codec::to_bytes(collateral));
    args
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct VerifiedReport {
    /// The overall TCB status, for example `"UpToDate"`.
    pub status: String,
    pub advisory_ids: Vec<String>,
    pub report: Report,
    /// The platform's PPID, from the PCK certificate. 16 bytes when present.
    pub ppid: Vec<u8>,
    pub qe_status: TcbStatusWithAdvisory,
    pub platform_status: TcbStatusWithAdvisory,
}

// The variants are the verifier's report formats: their sizes are the wire layout, not ours to change.
#[expect(clippy::large_enum_variant)]
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum Report {
    SgxEnclave(EnclaveReport),
    TD10(TDReport10),
    TD15(TDReport15),
    TD15Ex(TDReport15Ex),
}

impl Report {
    /// The TD10 view of a TD10, TD15 or TD15Ex report; `None` for SGX.
    pub fn as_td10(&self) -> Option<&TDReport10> {
        match self {
            Report::TD10(report) => Some(report),
            Report::TD15(report) => Some(&report.base),
            Report::TD15Ex(report) => Some(&report.base.base),
            Report::SgxEnclave(_) => None,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TDReport15Ex {
    pub base: TDReport15,
    pub vmid: u8,
    pub td_id: [u8; 32],
    pub dev_info: [u8; 48],
    pub init_service_td_hash: [u8; 48],
    pub init_service_td_attributes: [u8; 8],
    pub init_cpu_svn: [u8; 16],
    pub init_tee_tcb_svn: [u8; 16],
    pub init_tee_fmspc: [u8; 12],
    pub cur_service_td_hash: [u8; 48],
    pub cur_service_td_attributes: [u8; 8],
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TDReport10 {
    pub tee_tcb_svn: [u8; 16],
    pub mr_seam: [u8; 48],
    pub mr_signer_seam: [u8; 48],
    pub seam_attributes: [u8; 8],
    pub td_attributes: [u8; 8],
    pub xfam: [u8; 8],
    pub mr_td: [u8; 48],
    pub mr_config_id: [u8; 48],
    pub mr_owner: [u8; 48],
    pub mr_owner_config: [u8; 48],
    pub rt_mr0: [u8; 48],
    pub rt_mr1: [u8; 48],
    pub rt_mr2: [u8; 48],
    pub rt_mr3: [u8; 48],
    pub report_data: [u8; 64],
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TDReport15 {
    pub base: TDReport10,
    pub tee_tcb_svn2: [u8; 16],
    pub mr_service_td: [u8; 48],
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct EnclaveReport {
    pub cpu_svn: [u8; 16],
    pub misc_select: u32,
    pub reserved1: [u8; 28],
    pub attributes: [u8; 16],
    pub mr_enclave: [u8; 32],
    pub reserved2: [u8; 32],
    pub mr_signer: [u8; 32],
    pub reserved3: [u8; 96],
    pub isv_prod_id: u16,
    pub isv_svn: u16,
    pub reserved4: [u8; 60],
    pub report_data: [u8; 64],
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum TcbStatus {
    UpToDate,
    OutOfDateConfigurationNeeded,
    OutOfDate,
    ConfigurationAndSWHardeningNeeded,
    ConfigurationNeeded,
    SWHardeningNeeded,
    Revoked,
    TDRelaunchAdvised,
    TDRelaunchAdvisedConfigurationNeeded,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TcbStatusWithAdvisory {
    pub status: TcbStatus,
    pub advisory_ids: Vec<String>,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum VerifierError {
    /// `dcap-qvl` rejected the quote or its collateral.
    DcapVerification(String),
}

/// Validity window of the collateral a quote was verified against, in Unix seconds.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct CollateralDates {
    pub earliest_issue_date: u64,
    pub latest_issue_date: u64,
    pub earliest_expiration_date: u64,
    pub qe_iden_earliest_issue_date: u64,
    pub qe_iden_latest_issue_date: u64,
    pub qe_iden_earliest_expiration_date: u64,
}

/// The reply of `verify_quote_with_collateral_dates`. A rejection is a *value* of a successful
/// receipt, so it can be told apart from a failed promise (the verifier being down).
#[expect(clippy::large_enum_variant)]
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum VerificationResult {
    Verified {
        report: VerifiedReport,
        collateral_dates: CollateralDates,
    },
    Rejected(VerifierError),
}
