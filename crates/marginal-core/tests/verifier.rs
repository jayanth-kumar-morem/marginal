//! The verifier's Borsh types against REAL data: a reply from the live testnet verifier
//! (`tee-verifier-2026-11-02.testnet`, code hash 8SrqVCh3RtHz6mG2eiMwBGZDPkmccA5JiVvqrDYT3VL3) for a
//! real TDX quote, and near/mpc's own committed call arguments.

use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::json::to_hex;
use marginal_core::verifier::*;
use marginal_core::CoreError;

mod common;
use common::{fixture, real_reply_bytes};

#[test]
fn the_real_verified_reply_decodes_exactly_and_re_encodes_to_the_same_bytes() {
    let bytes = real_reply_bytes();
    assert_eq!(bytes.len(), 680);
    // Strict decoding: every byte is accounted for.
    let reply: VerificationResult = from_bytes(&bytes).unwrap();
    // And the encoding is canonical: nothing was lost or reordered.
    assert_eq!(to_bytes(&reply), bytes);

    let VerificationResult::Verified {
        report,
        collateral_dates,
    } = reply
    else {
        panic!("expected a verified reply")
    };
    assert_eq!(report.status, "UpToDate");
    assert!(report.advisory_ids.is_empty());
    assert_eq!(to_hex(&report.ppid), "d208dfb1002346ae1bb4ef2a3c055292");
    assert_eq!(
        report.qe_status,
        TcbStatusWithAdvisory {
            status: TcbStatus::UpToDate,
            advisory_ids: vec![]
        }
    );
    assert_eq!(report.platform_status.status, TcbStatus::UpToDate);
    let td = report.report.as_td10().expect("a TD report");
    assert!(matches!(report.report, Report::TD10(_)));
    assert_eq!(
        td.td_attributes,
        [0, 0, 0, 0x10, 0, 0, 0, 0],
        "not a debug TD"
    );
    assert_eq!(to_hex(&td.mr_td)[..24], *"f06dfda6dce1cf904d4e2bab");
    assert_eq!(to_hex(&td.rt_mr3)[..16], *"86f1808cffc050f3");
    assert_eq!(collateral_dates.earliest_expiration_date, 1_797_033_011);
    assert_eq!(collateral_dates.latest_issue_date, 1_794_443_797);
}

/// Bytes seen from the live verifier for a quote whose collateral had expired.
#[test]
fn the_real_rejection_layout() {
    let mut live = vec![1u8, 0, 15, 0, 0, 0];
    live.extend(b"TCBInfo expired");
    assert_eq!(live.len(), 21);
    let reply: VerificationResult = from_bytes(&live).unwrap();
    assert_eq!(
        reply,
        VerificationResult::Rejected(VerifierError::DcapVerification("TCBInfo expired".into()))
    );
    assert_eq!(to_bytes(&reply), live);
}

#[test]
fn tampered_replies_do_not_decode() {
    let bytes = real_reply_bytes();
    assert_eq!(
        from_bytes::<VerificationResult>(&bytes[..bytes.len() - 1]),
        Err(CoreError::Decode)
    );
    let mut trailing = bytes.clone();
    trailing.push(0);
    assert_eq!(
        from_bytes::<VerificationResult>(&trailing),
        Err(CoreError::Decode)
    );
    let mut unknown_variant = bytes;
    unknown_variant[0] = 9;
    assert_eq!(
        from_bytes::<VerificationResult>(&unknown_variant),
        Err(CoreError::Decode)
    );
}

/// near/mpc's own committed arguments for the verifier: our `Collateral` and `verify_args` must
/// reproduce them to the byte.
#[test]
fn the_real_call_arguments_round_trip_through_our_types() {
    let args = std::fs::read(fixture("tee-verifier-args.borsh")).unwrap();
    assert_eq!(args.len(), 24_178);
    let quote_len = u32::from_le_bytes(args[..4].try_into().unwrap()) as usize;
    assert_eq!(quote_len, 5_006, "a TDX quote v4");
    let (quote, rest) = args[4..].split_at(quote_len);
    let collateral: Collateral = from_bytes(rest).unwrap();
    assert!(
        collateral.tcb_info.starts_with(r#"{"id":"TDX""#),
        "Intel TCB info for TDX"
    );
    assert_eq!(verify_args(quote, &collateral), args);
}

#[test]
fn every_report_kind_has_a_td10_view_except_sgx() {
    let base = common::td10([5; 64], [6; 48]);
    let td15 = TDReport15 {
        base: base.clone(),
        tee_tcb_svn2: [0; 16],
        mr_service_td: [0; 48],
    };
    let td15ex = TDReport15Ex {
        base: td15.clone(),
        vmid: 0,
        td_id: [0; 32],
        dev_info: [0; 48],
        init_service_td_hash: [0; 48],
        init_service_td_attributes: [0; 8],
        init_cpu_svn: [0; 16],
        init_tee_tcb_svn: [0; 16],
        init_tee_fmspc: [0; 12],
        cur_service_td_hash: [0; 48],
        cur_service_td_attributes: [0; 8],
    };
    let sgx = EnclaveReport {
        cpu_svn: [0; 16],
        misc_select: 0,
        reserved1: [0; 28],
        attributes: [0; 16],
        mr_enclave: [0; 32],
        reserved2: [0; 32],
        mr_signer: [0; 32],
        reserved3: [0; 96],
        isv_prod_id: 0,
        isv_svn: 0,
        reserved4: [0; 60],
        report_data: [0; 64],
    };
    assert_eq!(Report::TD10(base.clone()).as_td10(), Some(&base));
    assert_eq!(Report::TD15(td15).as_td10(), Some(&base));
    assert_eq!(Report::TD15Ex(td15ex).as_td10(), Some(&base));
    assert_eq!(Report::SgxEnclave(sgx).as_td10(), None);
}

#[test]
fn collateral_has_a_json_model() {
    let args = std::fs::read(fixture("tee-verifier-args.borsh")).unwrap();
    let collateral: Collateral = from_bytes(&args[4 + 5_006..]).unwrap();
    let json = serde_json::to_value(&collateral).unwrap();
    assert!(
        json["pck_crl"]
            .as_str()
            .unwrap()
            .bytes()
            .all(|b| b.is_ascii_hexdigit()),
        "bytes are hex"
    );
    assert_eq!(
        serde_json::from_value::<Collateral>(json).unwrap(),
        collateral
    );
}
