//! Room attestation checks (SDD §3.13): the report-data binding, the RTMR3 replay (against real
//! dstack data) and every rule of the room policy, one failing case each.

use marginal_core::attest::*;
use marginal_core::certificate::{measurement_hash, Measurement};
use marginal_core::codec::{from_bytes, sha384};
use marginal_core::verifier::*;
use marginal_core::*;
use sha2::{Digest, Sha256, Sha512};

mod common;
use common::*;

fn td_report(result: &VerificationResult) -> &TDReport10 {
    match result {
        VerificationResult::Verified { report, .. } => report.report.as_td10().unwrap(),
        VerificationResult::Rejected(_) => panic!("rejected"),
    }
}

/// Runs the checks on a log with a report that is consistent with it, so only the policy under
/// test can fail.
fn evaluate(events: &[Rtmr3Event]) -> Result<Attested, CoreError> {
    let data = room_report_data(&binding());
    evaluate_quote(&verified_for(events, data), events, &data, NOW)
}

/// A verified result, adjusted by `edit`.
fn adjusted(edit: impl FnOnce(&mut VerifiedReport, &mut CollateralDates)) -> VerificationResult {
    let VerificationResult::Verified {
        mut report,
        mut collateral_dates,
    } = verified_for(&valid_log(), room_report_data(&binding()))
    else {
        unreachable!()
    };
    edit(&mut report, &mut collateral_dates);
    VerificationResult::Verified {
        report,
        collateral_dates,
    }
}

fn check(result: &VerificationResult) -> Result<Attested, CoreError> {
    evaluate_quote(result, &valid_log(), &room_report_data(&binding()), NOW)
}

// ---------------------------------------------------------------------------------------------
// The binding

#[test]
fn report_data_is_sha512_of_the_domain_and_the_borsh_binding() {
    let b = binding();
    let mut hasher = Sha512::new();
    hasher.update(b"marginal-room-v1");
    hasher.update(borsh::to_vec(&b).unwrap());
    assert_eq!(room_report_data(&b).to_vec(), hasher.finalize().to_vec());
    assert_eq!(ROOM_REPORT_DOMAIN, b"marginal-room-v1");
}

/// A quote cannot be replayed on another chain or KeyPolicy, or with other keys or another nonce.
#[test]
fn every_field_of_the_binding_is_bound() {
    let edits: Vec<Edit<RoomBinding>> = vec![
        ("chain_id", |b| b.chain_id = "mainnet".into()),
        ("keypolicy", |b| {
            b.keypolicy = "keypolicy2.marginal-demo.testnet".into()
        }),
        ("sign_pk", |b| b.sign_pk[0] ^= 1),
        ("box_pk", |b| b.box_pk[31] ^= 1),
        ("nonce", |b| b.nonce[7] ^= 1),
    ];
    assert_every_edit_changes_the_digest(&binding(), &edits, room_report_data);
}

/// Strings are length-prefixed, so moving a byte from one string to the next changes the data.
/// (A plain concatenation of the two would give the same bytes for both.)
#[test]
fn the_binding_cannot_be_confused_by_shifting_string_boundaries() {
    let a = RoomBinding {
        chain_id: "testnet".into(),
        keypolicy: "x.testnet".into(),
        ..binding()
    };
    let b = RoomBinding {
        chain_id: "testnetx".into(),
        keypolicy: ".testnet".into(),
        ..binding()
    };
    assert_eq!(
        format!("{}{}", a.chain_id, a.keypolicy),
        format!("{}{}", b.chain_id, b.keypolicy)
    );
    assert_ne!(room_report_data(&a), room_report_data(&b));
}

/// The room signs the report data of exactly this registration, under its own domain.
#[test]
fn proof_of_possession_signs_the_report_data_under_its_own_domain() {
    let b = binding();
    assert_eq!(
        room_pop_signing_bytes(&b),
        [b"marginal/room-pop/v1".as_slice(), &room_report_data(&b)].concat()
    );
    assert_eq!(ROOM_POP_DOMAIN, b"marginal/room-pop/v1");
    // Not the report data alone (which a quote carries): a signature over that is not a registration.
    assert_ne!(room_pop_signing_bytes(&b), room_report_data(&b).to_vec());
    let edits: Vec<Edit<RoomBinding>> = vec![
        ("sign_pk", |b| b.sign_pk[0] ^= 1),
        ("box_pk", |b| b.box_pk[0] ^= 1),
        ("nonce", |b| b.nonce[0] ^= 1),
    ];
    assert_every_edit_changes_the_digest(&b, &edits, room_pop_signing_bytes);
}

#[test]
fn ppid_hash_is_domain_separated() {
    let mut hasher = Sha256::new();
    hasher.update(b"marginal/ppid/v1");
    hasher.update([0xab; 16]);
    assert_eq!(ppid_hash(&[0xab; 16]).to_vec(), hasher.finalize().to_vec());
    assert_ne!(ppid_hash(&[0xab; 16]), ppid_hash(&[0xac; 16]));
    assert_ne!(
        ppid_hash(&[0xab; 16]).to_vec(),
        Sha256::digest([0xab; 16]).to_vec(),
        "not the bare hash"
    );
}

// ---------------------------------------------------------------------------------------------
// The RTMR3 replay, against real data

/// The headline check (E3.2): replaying a REAL dstack event log gives the RTMR3 a REAL quote
/// reported, and every event's recorded digest is the one we compute.
#[test]
fn replaying_the_real_event_log_reproduces_the_real_quoted_rtmr3() {
    let VerificationResult::Verified { report, .. } =
        from_bytes::<VerificationResult>(&real_reply_bytes()).unwrap()
    else {
        panic!()
    };
    let quoted = report.report.as_td10().unwrap().rt_mr3;
    let events = real_events();
    assert_eq!(events.len(), 9);
    assert_eq!(replay_rtmr3(&events), Ok(quoted));

    // The digests dstack recorded for each event are the ones event_digest computes.
    let file: serde_json::Value =
        serde_json::from_slice(&std::fs::read(fixture("dstack-rtmr3-events.json")).unwrap())
            .unwrap();
    for (event, recorded) in events.iter().zip(file["events"].as_array().unwrap()) {
        assert_eq!(
            marginal_core::json::to_hex(&event_digest(event)),
            recorded["digest"].as_str().unwrap(),
            "{}",
            event.name
        );
    }
}

#[test]
fn the_replay_follows_the_definition() {
    assert_eq!(
        replay_rtmr3(&[]),
        Ok([0; 48]),
        "no events: the register stays zero"
    );
    let (a, b) = (event("a", b"1"), event("b", b""));
    let da = sha384(&[&DSTACK_EVENT_TYPE.to_le_bytes(), b":a:1"]);
    assert_eq!(event_digest(&a), da);
    let r1 = sha384(&[&[0u8; 48], &da]);
    assert_eq!(replay_rtmr3(std::slice::from_ref(&a)), Ok(r1));
    let r2 = sha384(&[&r1, &event_digest(&b)]);
    assert_eq!(replay_rtmr3(&[a.clone(), b.clone()]), Ok(r2));
    assert_ne!(replay_rtmr3(&[b, a]), Ok(r2), "order matters");
}

#[test]
fn an_event_that_is_not_a_dstack_event_cannot_be_replayed() {
    let mut odd = event("a", b"");
    odd.event_type = 1;
    assert_eq!(replay_rtmr3(&[odd]), Err(CoreError::Rtmr3Events));
}

// ---------------------------------------------------------------------------------------------
// The room policy on the event log

#[test]
fn a_room_that_meets_the_policy_is_accepted() {
    let attested = evaluate(&valid_log()).unwrap();
    assert_eq!(attested.measurement.compose_hash, COMPOSE);
    assert_eq!(attested.measurement.gpu_policy_hash, None);
    assert_eq!(
        attested.measurement.key_provider_digest,
        event_digest(&event("key-provider", KEY_PROVIDER_NONE))
    );
    assert_eq!(KEY_PROVIDER_NONE, br#"{"name":"none","id":""}"#);
    assert_eq!(valid_log().len(), 9);
}

fn without(name: &str) -> Vec<Rtmr3Event> {
    valid_log().into_iter().filter(|e| e.name != name).collect()
}

fn with_payload(name: &str, payload: &[u8]) -> Vec<Rtmr3Event> {
    valid_log()
        .into_iter()
        .map(|e| {
            if e.name == name {
                event(name, payload)
            } else {
                e
            }
        })
        .collect()
}

#[test]
fn every_required_event_must_be_present_exactly_once() {
    for name in [
        "compose-hash",
        "app-id",
        "key-provider",
        "instance-id",
        "storage-encrypted",
        "system-ready",
    ] {
        assert_eq!(
            evaluate(&without(name)),
            Err(CoreError::Rtmr3Events),
            "{name} missing"
        );
        let mut twice = valid_log();
        let again = twice.iter().find(|e| e.name == name).unwrap().clone();
        twice.push(again);
        assert_eq!(
            evaluate(&twice),
            Err(CoreError::Rtmr3Events),
            "{name} repeated"
        );
    }
}

#[test]
fn every_required_event_must_have_the_right_payload() {
    assert_eq!(
        evaluate(&with_payload("compose-hash", &COMPOSE[..31])),
        Err(CoreError::Rtmr3Events),
        "compose hash too short"
    );
    assert_eq!(
        evaluate(&with_payload("app-id", &[0xff; 20])),
        Err(CoreError::Rtmr3Events),
        "app-id is not the compose hash prefix"
    );
    assert_eq!(
        evaluate(&with_payload("app-id", &COMPOSE[..19])),
        Err(CoreError::Rtmr3Events),
        "app-id too short"
    );
    assert_eq!(
        evaluate(&with_payload("key-provider", br#"{"name":"local-sgx"}"#)),
        Err(CoreError::Rtmr3Events),
        "a key provider: a KMS"
    );
    assert_eq!(
        evaluate(&with_payload(
            "key-provider",
            br#"{"name": "none", "id": ""}"#
        )),
        Err(CoreError::Rtmr3Events),
        "not the exact bytes"
    );
    assert_eq!(
        evaluate(&with_payload("instance-id", b"x")),
        Err(CoreError::Rtmr3Events),
        "an instance id"
    );
    assert_eq!(
        evaluate(&with_payload("storage-encrypted", b"0")),
        Err(CoreError::Rtmr3Events),
        "storage not encrypted"
    );
}

#[test]
fn the_events_that_prove_no_kms_and_no_injected_script_must_be_absent() {
    for name in ["os-image-hash", "init-script-hash"] {
        let mut log = valid_log();
        log.insert(3, event(name, &[1; 32]));
        assert_eq!(evaluate(&log), Err(CoreError::Rtmr3Events), "{name}");
    }
}

#[test]
fn a_gpu_policy_event_is_recorded_once_or_refused() {
    let mut log = valid_log();
    log.push(event("gpu-policy-hash", &[0x77; 32]));
    assert_eq!(
        evaluate(&log).unwrap().measurement.gpu_policy_hash,
        Some([0x77; 32])
    );
    let mut twice = log.clone();
    twice.push(event("gpu-policy-hash", &[0x78; 32]));
    assert_eq!(
        evaluate(&twice),
        Err(CoreError::Rtmr3Events),
        "two GPU policies"
    );
    let mut short = valid_log();
    short.push(event("gpu-policy-hash", &[0x77; 31]));
    assert_eq!(
        evaluate(&short),
        Err(CoreError::Rtmr3Events),
        "a GPU policy hash is 32 bytes"
    );
}

/// Unknown extra events do not matter: the measurement pins what runs.
#[test]
fn other_events_are_allowed() {
    let mut log = valid_log();
    log.push(event("something-new", b"x"));
    assert!(evaluate(&log).is_ok());
}

// ---------------------------------------------------------------------------------------------
// Everything about the quote itself

#[test]
fn the_measurement_comes_from_the_quote_and_the_log() {
    let attested = check(&verified_for(&valid_log(), room_report_data(&binding()))).unwrap();
    let td = td10([0; 64], [0; 48]);
    assert_eq!(
        attested.measurement,
        Measurement {
            mrtd: td.mr_td,
            rtmr0: td.rt_mr0,
            rtmr1: td.rt_mr1,
            rtmr2: td.rt_mr2,
            compose_hash: COMPOSE,
            key_provider_digest: event_digest(&event("key-provider", KEY_PROVIDER_NONE)),
            gpu_policy_hash: None,
        }
    );
    assert_eq!(attested.ppid_hash, ppid_hash(&[0xab; 16]));
    assert_eq!(attested.tcb_status, "UpToDate");
    assert_eq!(attested.tee_tcb_svn, [1; 16]);
    assert_eq!(attested.collateral_issued_at, NOW - 86_400);
    assert_ne!(measurement_hash(&attested.measurement), [0; 32]);
}

#[test]
fn the_attestation_ends_after_a_day_or_with_the_collateral_whichever_is_first() {
    assert_eq!(
        check(&adjusted(|_, _| {})).unwrap().expires_at,
        NOW + MAX_ATTESTATION_SECS
    );
    let soon = adjusted(|_, dates| dates.earliest_expiration_date = NOW + 3_600);
    assert_eq!(check(&soon).unwrap().expires_at, NOW + 3_600);
    assert_eq!(MAX_ATTESTATION_SECS, 86_400);
}

#[test]
fn a_rejected_quote_or_an_sgx_report_is_refused() {
    let rejected =
        VerificationResult::Rejected(VerifierError::DcapVerification("TCBInfo expired".into()));
    assert_eq!(check(&rejected), Err(CoreError::QuoteSig));
    let sgx = adjusted(|report, _| {
        report.report = Report::SgxEnclave(EnclaveReport {
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
        })
    });
    assert_eq!(check(&sgx), Err(CoreError::QuoteSig));
}

#[test]
fn newer_td_report_formats_are_read_through_their_td10_base() {
    let data = room_report_data(&binding());
    let wrap = |as_td15: bool| {
        adjusted(|report, _| {
            let base = td_report(&verified_for(&valid_log(), data)).clone();
            let td15 = TDReport15 {
                base,
                tee_tcb_svn2: [0; 16],
                mr_service_td: [0; 48],
            };
            report.report = if as_td15 {
                Report::TD15(td15)
            } else {
                Report::TD15Ex(TDReport15Ex {
                    base: td15,
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
                })
            };
        })
    };
    assert!(check(&wrap(true)).is_ok());
    assert!(check(&wrap(false)).is_ok());
}

#[test]
fn only_an_up_to_date_platform_is_accepted() {
    for status in [
        "OutOfDate",
        "SWHardeningNeeded",
        "ConfigurationNeeded",
        "Revoked",
        "",
        "uptodate",
    ] {
        let result = adjusted(|report, _| report.status = status.into());
        assert_eq!(check(&result), Err(CoreError::TcbStatus), "{status:?}");
    }
    assert_eq!(TCB_UP_TO_DATE, "UpToDate");
}

#[test]
fn a_debug_td_is_refused_whatever_the_other_attributes() {
    for first in [0x01u8, 0x03, 0xff] {
        let data = room_report_data(&binding());
        let result = adjusted(|report, _| {
            let mut td = td_report(&verified_for(&valid_log(), data)).clone();
            td.td_attributes[0] = first;
            report.report = Report::TD10(td);
        });
        assert_eq!(
            check(&result),
            Err(CoreError::DebugTd),
            "td_attributes[0] = {first:#x}"
        );
    }
    let data = room_report_data(&binding());
    let others = adjusted(|report, _| {
        let mut td = td_report(&verified_for(&valid_log(), data)).clone();
        td.td_attributes = [0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
        report.report = Report::TD10(td);
    });
    assert!(
        check(&others).is_ok(),
        "every bit but the debug bit is not our concern"
    );
}

#[test]
fn the_report_data_must_be_exactly_the_binding() {
    let data = room_report_data(&binding());
    for bit in [0usize, 31, 63] {
        let mut wrong = data;
        wrong[bit] ^= 1;
        assert_eq!(
            evaluate_quote(&verified_for(&valid_log(), wrong), &valid_log(), &data, NOW),
            Err(CoreError::ReportData),
            "byte {bit}"
        );
    }
    // A quote for another nonce is a quote for another registration.
    let other = RoomBinding {
        nonce: h(99),
        ..binding()
    };
    assert_eq!(
        evaluate_quote(
            &verified_for(&valid_log(), room_report_data(&other)),
            &valid_log(),
            &data,
            NOW
        ),
        Err(CoreError::ReportData)
    );
}

#[test]
fn the_ppid_must_be_present_and_16_bytes() {
    for len in [0usize, 1, 15, 17, 32] {
        let result = adjusted(|report, _| report.ppid = vec![0xab; len]);
        assert_eq!(check(&result), Err(CoreError::Ppid), "{len} bytes");
    }
}

#[test]
fn expired_collateral_is_refused_at_the_boundary() {
    let at = adjusted(|_, d| d.earliest_expiration_date = NOW);
    assert_eq!(
        check(&at),
        Err(CoreError::CollateralStale),
        "expiring exactly now is expired"
    );
    let past = adjusted(|_, d| d.earliest_expiration_date = NOW - 1);
    assert_eq!(check(&past), Err(CoreError::CollateralStale));
    let last_second = adjusted(|_, d| d.earliest_expiration_date = NOW + 1);
    assert_eq!(check(&last_second).unwrap().expires_at, NOW + 1);
}

#[test]
fn the_log_must_replay_to_the_quoted_rtmr3() {
    let data = room_report_data(&binding());
    let wrong_quote = adjusted(|report, _| {
        let mut td = td_report(&verified_for(&valid_log(), data)).clone();
        td.rt_mr3[0] ^= 1;
        report.report = Report::TD10(td);
    });
    assert_eq!(check(&wrong_quote), Err(CoreError::Rtmr3Replay));
    // The same quote, with an event dropped from the log: it no longer replays.
    let result = verified_for(&valid_log(), data);
    assert_eq!(
        evaluate_quote(&result, &without("storage-fs"), &data, NOW),
        Err(CoreError::Rtmr3Replay)
    );
    // Or with the events reordered.
    let mut reordered = valid_log();
    reordered.swap(0, 1);
    assert_eq!(
        evaluate_quote(&result, &reordered, &data, NOW),
        Err(CoreError::Rtmr3Replay)
    );
}

#[test]
fn a_log_with_an_event_that_is_not_a_dstack_event_is_refused_by_the_full_check() {
    let data = room_report_data(&binding());
    let result = verified_for(&valid_log(), data);
    let mut odd = valid_log();
    odd[0].event_type = 1;
    assert_eq!(
        evaluate_quote(&result, &odd, &data, NOW),
        Err(CoreError::Rtmr3Events)
    );
}

/// Checks run in a fixed order, so a report with several faults always reports the same one.
#[test]
fn the_checks_run_in_a_fixed_order() {
    let all_wrong = adjusted(|report, dates| {
        report.status = "Revoked".into();
        report.ppid = vec![];
        dates.earliest_expiration_date = 0;
    });
    assert_eq!(check(&all_wrong), Err(CoreError::TcbStatus), "TCB first");
    let no_ppid_and_expired = adjusted(|report, dates| {
        report.ppid = vec![];
        dates.earliest_expiration_date = 0;
    });
    assert_eq!(
        check(&no_ppid_and_expired),
        Err(CoreError::Ppid),
        "then the PPID, before the collateral"
    );
}

/// A REAL quote from a REAL machine, through our checks. It passes the TCB, debug, report-data,
/// PPID, collateral and RTMR3 checks and is then refused by our event policy, because near/mpc's
/// node runs a KMS-style key provider where ours must run none.
#[test]
fn a_real_mpc_room_passes_the_hardware_checks_and_fails_our_event_policy() {
    let real: VerificationResult = from_bytes(&real_reply_bytes()).unwrap();
    let report_data = td_report(&real).report_data;
    assert_eq!(
        evaluate_quote(&real, &real_events(), &report_data, 1_794_443_800),
        Err(CoreError::Rtmr3Events)
    );
    // One second after its collateral ends, the same quote is stale instead.
    assert_eq!(
        evaluate_quote(&real, &real_events(), &report_data, 1_797_033_011),
        Err(CoreError::CollateralStale)
    );
    // Bound to something else, it is refused earlier still.
    assert_eq!(
        evaluate_quote(&real, &real_events(), &[0; 64], 1_794_443_800),
        Err(CoreError::ReportData)
    );
}

#[test]
fn the_registration_request_and_admission_have_stable_shapes() {
    let request = RegisterRoomRequest {
        quote: vec![1, 2, 3],
        collateral: from_bytes(
            &std::fs::read(fixture("tee-verifier-args.borsh")).unwrap()[4 + 5_006..],
        )
        .unwrap(),
        events: valid_log(),
        sign_pk: h(1),
        box_pk: h(2),
        nonce: h(3),
        class: RoomClass::K,
        sign_sig: [9; 64],
    };
    let bytes = marginal_core::codec::to_bytes(&request);
    assert_eq!(
        from_bytes::<RegisterRoomRequest>(&bytes),
        Ok(request.clone())
    );
    let json = serde_json::to_value(&request).unwrap();
    assert_eq!(
        serde_json::from_value::<RegisterRoomRequest>(json.clone()).unwrap(),
        request
    );
    assert_eq!(json["quote"], "010203");
    assert_eq!(json["class"], "K");
    assert_eq!(json["sign_sig"], "09".repeat(64));
    assert_eq!(json["events"][1]["name"], "app-id");

    let admit = AdmitRoom {
        room_key: h(1),
        box_pk: h(2),
        ppid_hash: h(3),
        measurement: evaluate(&valid_log()).unwrap().measurement,
        class: RoomClass::K,
        tcb_status: "UpToDate".into(),
        tee_tcb_svn: [1; 16],
        registered_height: 77,
        expires_at: NOW + 86_400,
        collateral_issued_at: NOW - 1,
        quote_hash: h(4),
        attestation_mode: AttestationMode::OnChainDcap,
    };
    let json = serde_json::to_value(&admit).unwrap();
    assert_eq!(
        serde_json::from_value::<AdmitRoom>(json.clone()).unwrap(),
        admit
    );
    assert_eq!(json["room_key"], "01".repeat(32));
    assert_eq!(json["attestation_mode"], "OnChainDcap");
    assert_eq!(json["measurement"]["compose_hash"], "c0".repeat(32));
}
