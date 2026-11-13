//! E5.7: the agent access and spend firewall (SDD §3.21, D5, AC-50).

use super::*;

#[test]
fn a_buyer_registers_and_revokes_its_own_agent_keys() {
    let mut c = contract();
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    assert_eq!(
        c.get_agent_caps(account(BUYER), to_hex(&agent_key())),
        Some(caps())
    );
    assert_eq!(
        c.get_agent_spend(account(BUYER), to_hex(&agent_key())),
        Some(U128(0))
    );
    assert_eq!(events()[0]["event"], "agent_key_registered");

    call_as(BUYER, no_deposit());
    c.revoke_agent_key(to_hex(&agent_key()));
    assert_eq!(c.get_agent_caps(account(BUYER), to_hex(&agent_key())), None);
    assert_eq!(
        c.get_agent_spend(account(BUYER), to_hex(&agent_key())),
        None
    );
    assert_eq!(events()[0]["event"], "agent_key_revoked");

    // One account's key says nothing about another's.
    assert_eq!(
        c.get_agent_caps(account(SELLER), to_hex(&agent_key())),
        None
    );
}

/// An agent cannot widen its own caps, mint another key, or approve its own parked jobs (§3.21).
#[test]
fn an_agent_key_cannot_use_the_admin_methods() {
    let mut c = contract();
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());

    call_with_key(BUYER, agent_key());
    expect_panic("E_AGENT_CAP", || {
        c.register_agent_key(to_hex(&[0x6f; 32]), caps())
    });
    call_with_key(BUYER, agent_key());
    expect_panic("E_AGENT_CAP", || c.revoke_agent_key(to_hex(&agent_key())));
    call_with_key(BUYER, agent_key());
    expect_panic("E_AGENT_CAP", || {
        c.approve_parked(U64(1));
    });
}

#[test]
fn caps_must_be_usable() {
    let mut c = contract();
    for (reason, caps) in [
        (
            "window must be positive",
            AgentCaps {
                window_secs: 0,
                ..caps()
            },
        ),
        (
            "caps must be positive",
            AgentCaps {
                per_job_budget_max: U128(0),
                ..caps()
            },
        ),
        (
            "caps must be positive",
            AgentCaps {
                window_max: U128(0),
                ..caps()
            },
        ),
    ] {
        call_as(BUYER, no_deposit());
        expect_panic(reason, || {
            c.register_agent_key(to_hex(&agent_key()), caps.clone())
        });
    }
    call_as(BUYER, no_deposit());
    expect_panic("E_DECODE", || c.register_agent_key("zz".into(), caps()));
    call_as(BUYER, no_deposit());
    expect_panic("E_DECODE", || c.revoke_agent_key("zz".into()));
    assert!(c
        .get_agent_caps(account(BUYER), to_hex(&agent_key()))
        .is_none());
}

/// DRC-5: a job inside the caps goes through, one above `human_above` is parked for a human, and
/// one over a cap is blocked and recorded.
#[test]
fn the_firewall_allows_parks_and_blocks() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());

    // Inside every cap: the job is created as if the buyer had asked.
    call_with_key(BUYER, agent_key());
    let job_id = created(&c.request_appraisal(b64(&AppraisalRequest {
        budget: 450_000_000,
        ..request(listing_id)
    })));
    assert_eq!(c.get_job(U64(job_id)).unwrap()["state"], "Assigned");
    assert_eq!(
        c.get_agent_spend(account(BUYER), to_hex(&agent_key())),
        Some(U128(450_000_000))
    );

    // Above `human_above`: parked, and no room is assigned until a human approves.
    call_with_key(BUYER, agent_key());
    let answer = c.request_appraisal(b64(&AppraisalRequest {
        budget: 560_000_000,
        ..request(listing_id)
    }));
    assert_eq!(answer["status"], "Parked");
    let parked_id: u64 = answer["job_id"].as_str().unwrap().parse().unwrap();
    let parked = c.get_job(U64(parked_id)).unwrap();
    assert_eq!(parked["state"], "PendingApproval");
    assert_eq!(parked["assigned"], json!([]));
    assert_eq!(
        events()
            .iter()
            .filter(|e| e["event"] == "job_parked")
            .count(),
        1
    );

    // Over the per-job cap: blocked, no job, and the attempt is on the chain.
    call_with_key(BUYER, agent_key());
    let blocked = c.request_appraisal(b64(&AppraisalRequest {
        budget: 700_000_000,
        ..request(listing_id)
    }));
    assert_eq!(
        blocked,
        json!({"status": "Blocked", "cap": "per_job_budget_max"})
    );
    let logged = events();
    assert_eq!(logged[0]["event"], "agent_blocked");
    assert_eq!(logged[0]["data"][0]["cap"], "per_job_budget_max");
    assert_eq!(logged[0]["data"][0]["budget"], "700000000");
}

/// A blocked request changes nothing: no job, no money moved, no leakage reserved.
#[test]
fn a_blocked_request_leaves_everything_as_it_was() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    let before = (
        c.get_balance(account(BUYER), account(TOKEN)),
        c.get_leakage(U64(listing_id)).unwrap(),
        c.config()["next_job_id"].clone(),
    );

    call_with_key(BUYER, agent_key());
    let blocked = c.request_appraisal(b64(&AppraisalRequest {
        budget: 700_000_000,
        ..request(listing_id)
    }));
    assert_eq!(blocked["status"], "Blocked");
    assert_eq!(c.get_balance(account(BUYER), account(TOKEN)), before.0);
    assert_eq!(c.get_leakage(U64(listing_id)).unwrap(), before.1);
    assert_eq!(c.config()["next_job_id"], before.2, "no job id was spent");
    assert_eq!(
        c.get_agent_spend(account(BUYER), to_hex(&agent_key())),
        Some(U128(0)),
        "and nothing counted against the window"
    );
}

/// The window caps how much and how often an agent may spend, and it starts again when it ends.
#[test]
fn a_window_bounds_what_an_agent_spends_and_then_resets() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    let small = AppraisalRequest {
        budget: 450_000_000,
        ..request(listing_id)
    };

    call_with_key(BUYER, agent_key());
    created(&c.request_appraisal(b64(&small)));
    call_with_key(BUYER, agent_key());
    created(&c.request_appraisal(b64(&small)));

    // A third job in the same window is over `max_jobs_per_window`.
    call_with_key(BUYER, agent_key());
    assert_eq!(
        c.request_appraisal(b64(&small))["cap"],
        "max_jobs_per_window"
    );

    // An hour later the window has rolled over.
    let mut pk = vec![0u8];
    pk.extend_from_slice(&agent_key());
    testing_env!(context(BUYER, no_deposit(), HEIGHT, NOW + 3_600)
        .signer_account_pk(pk.clone().try_into().unwrap())
        .build());
    created(&c.request_appraisal(b64(&small)));
    assert_eq!(
        c.get_agent_spend(account(BUYER), to_hex(&agent_key())),
        Some(U128(450_000_000)),
        "the window counts from scratch"
    );
}

/// `window_max` stops an agent spending more than its owner allowed, even within the job count.
#[test]
fn the_window_total_is_a_cap_of_its_own() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(
        to_hex(&agent_key()),
        AgentCaps {
            max_jobs_per_window: 10,
            window_max: U128(900_000_000),
            ..caps()
        },
    );
    let small = AppraisalRequest {
        budget: 450_000_000,
        ..request(listing_id)
    };
    call_with_key(BUYER, agent_key());
    created(&c.request_appraisal(b64(&small)));
    call_with_key(BUYER, agent_key());
    created(&c.request_appraisal(b64(&small)));
    call_with_key(BUYER, agent_key());
    assert_eq!(c.request_appraisal(b64(&small))["cap"], "window_max");
}

/// A parked job runs only once a human approves it, and only the buyer can.
#[test]
fn a_parked_job_waits_for_a_human() {
    let mut c = contract();
    let listing_id = ready(&mut c);
    call_as(BUYER, no_deposit());
    c.register_agent_key(to_hex(&agent_key()), caps());
    call_with_key(BUYER, agent_key());
    let answer = c.request_appraisal(b64(&AppraisalRequest {
        budget: 560_000_000,
        ..request(listing_id)
    }));
    let job_id: u64 = answer["job_id"].as_str().unwrap().parse().unwrap();

    call_as(SELLER, no_deposit());
    expect_panic("only the buyer", || {
        c.approve_parked(U64(job_id));
    });
    call_as(BUYER, no_deposit());
    assert_eq!(c.approve_parked(U64(job_id)), U64(job_id));
    let job = c.get_job(U64(job_id)).unwrap();
    assert_eq!(job["state"], "Assigned");
    assert_eq!(job["assigned"].as_array().unwrap().len(), 1);

    // Approving twice is refused: the job has left `PendingApproval`.
    call_as(BUYER, no_deposit());
    expect_panic("E_JOB_STATE", || {
        c.approve_parked(U64(job_id));
    });
    call_as(BUYER, no_deposit());
    expect_panic("E_TICKET", || {
        c.approve_parked(U64(999));
    });
}
