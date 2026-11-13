//! E4.1: the views, including the ones SDD §3.6 needs (`get_jobs_for_room`, SDD issue 5).

use super::*;

#[test]
fn config_shows_the_deployment_the_policy_and_the_fees_it_charges() {
    let mut c = contract();
    call_as(GOV, no_deposit());
    c.set_fees(FeeTable {
        clearing_fee_buyer_bps: 25,
        ..FeeTable::default()
    });
    let config = c.config();
    assert_eq!(config["version"], crate::CLEARING_VERSION);
    assert_eq!(config["profile"]["profile"], "sandbox");
    assert_eq!(config["profile"]["rules_enabled"], json!(["R1"]));
    assert_eq!(config["fees"]["clearing_fee_buyer_bps"], 25);
    assert_eq!(config["issuer_key"], Value::Null);
    assert_eq!(
        config["fee_schedule"]["listing"],
        LISTING_FEE.as_yoctonear().to_string()
    );
    assert_eq!(
        config["fee_schedule"]["snapshot"],
        SNAPSHOT_FEE.as_yoctonear().to_string()
    );
}

#[test]
fn a_room_sees_only_its_own_open_jobs() {
    let mut c = contract();
    with_room(&mut c);
    let listing_id = draft(&mut c);
    call_as(SELLER, no_deposit());
    let job_id = c.begin_provisioning(U64(listing_id)).0;

    let jobs = c.get_jobs_for_room(to_hex(&room_key()));
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0]["id"], job_id);
    assert_eq!(jobs[0]["listing_id"], listing_id);
    assert_eq!(
        jobs[0]["job_commitment"],
        c.get_job(U64(job_id)).unwrap()["job_commitment"]
    );

    assert_eq!(
        c.get_jobs_for_room(to_hex(&[0xaa; 32])),
        Vec::<Value>::new(),
        "another room"
    );
    assert_eq!(
        c.get_jobs_for_room("zz".into()),
        Vec::<Value>::new(),
        "not a key"
    );
    assert_eq!(c.get_job(U64(999)), None);
}

#[test]
fn the_leakage_view_shows_what_is_left() {
    let mut c = contract();
    with_room(&mut c);
    let id = draft(&mut c);
    let leakage = c.get_leakage(U64(id)).unwrap();
    assert_eq!(leakage["budget_mbits"], 100_000);
    assert_eq!(leakage["spent_mbits"], 0);
    assert_eq!(leakage["remaining_mbits"], 100_000);
    assert_eq!(
        leakage["price_per_bit"], "1000",
        "amounts are decimal strings"
    );
    assert_eq!(c.get_leakage(U64(999)), None);
}
