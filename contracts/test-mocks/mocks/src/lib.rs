//! Test doubles for the contracts KeyPolicy talks to, as one wasm that sandbox tests deploy under
//! several accounts: the locked quote verifier, the registry and clearing (one account in M1), and
//! the MPC network. Each role records what it was asked, and can be told to refuse. Never deployed
//! outside sandbox tests.

use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, require};

#[near(contract_state)]
#[derive(Default)]
pub struct Mocks {
    verifier_reply: Vec<u8>,
    denied_rooms: Vec<String>,
    release_denied: bool,
    expected_commitment: Option<String>,
    mpc_down: bool,
    admitted: Vec<String>,
    releases: Vec<String>,
    mpc_requests: Vec<String>,
}

#[near]
impl Mocks {
    // ---- the verifier -------------------------------------------------------------------------

    /// What the verifier will answer, as hex of the Borsh `VerificationResult`.
    pub fn set_verifier_reply(&mut self, reply_hex: String) {
        self.verifier_reply = hex::decode(reply_hex).expect("hex");
    }

    /// Answers with the configured bytes, whatever it is sent.
    pub fn verify_quote_with_collateral_dates(&self) {
        env::value_return(&self.verifier_reply);
    }

    // ---- the registry and clearing ------------------------------------------------------------

    pub fn admit_room(&mut self, room: Value) {
        self.admitted.push(room.to_string());
    }

    pub fn check_room(&self, room_key: String) -> Value {
        let denied = self.denied_rooms.contains(&room_key);
        json!({"ok": !denied, "deny_reasons": if denied { vec!["revoked"] } else { vec![] }})
    }

    /// Clearing's `authorize_release`: refuses when told to, or when the commitment is not the one it
    /// expects (a job that does not match).
    pub fn authorize_release(
        &mut self,
        job_id: u64,
        room_key: String,
        path_hash: String,
        job_commitment: String,
        value_class: String,
    ) {
        require!(!self.release_denied, "E_PLATFORM_CAP");
        require!(
            self.expected_commitment
                .as_ref()
                .is_none_or(|expected| *expected == job_commitment),
            "E_COMMITMENT_MISMATCH"
        );
        self.releases.push(json!({"job_id": job_id, "room_key": room_key, "path_hash": path_hash, "job_commitment": job_commitment, "value_class": value_class}).to_string());
    }

    pub fn set_room_ok(&mut self, room_key: String, ok: bool) {
        self.denied_rooms.retain(|r| *r != room_key);
        if !ok {
            self.denied_rooms.push(room_key);
        }
    }

    pub fn set_release_denied(&mut self, denied: bool) {
        self.release_denied = denied;
    }

    pub fn set_expected_commitment(&mut self, commitment: Option<String>) {
        self.expected_commitment = commitment;
    }

    /// JSON of every room admitted so far.
    pub fn admitted(&self) -> Vec<String> {
        self.admitted.clone()
    }

    /// JSON of every release authorised so far.
    pub fn releases(&self) -> Vec<String> {
        self.releases.clone()
    }

    // ---- the MPC network ----------------------------------------------------------------------

    /// Answers like the MPC contract after its yield and resume: a fixed `{big_y, big_c}`. Payable,
    /// because the real one needs an attached deposit.
    #[payable]
    pub fn request_app_private_key(&mut self, request: Value) -> Value {
        require!(!self.mpc_down, "mpc is down");
        self.mpc_requests.push(request.to_string());
        json!({"big_y": "bls12381g1:Yfixed", "big_c": "bls12381g1:Cfixed"})
    }

    pub fn set_mpc_down(&mut self, down: bool) {
        self.mpc_down = down;
    }

    /// JSON of every CKD request so far.
    pub fn mpc_requests(&self) -> Vec<String> {
        self.mpc_requests.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::get_logs;

    #[test]
    fn the_verifier_answers_with_exactly_the_configured_bytes() {
        let mut m = Mocks::default();
        m.set_verifier_reply("00ff10".into());
        m.verify_quote_with_collateral_dates();
        assert!(get_logs().is_empty());
        assert_eq!(m.verifier_reply, vec![0, 255, 16]);
    }

    #[test]
    fn the_registry_records_admissions_and_can_deny_a_room() {
        let mut m = Mocks::default();
        m.admit_room(json!({"room": 1}));
        assert_eq!(m.admitted(), vec![r#"{"room":1}"#.to_string()]);
        assert_eq!(
            m.check_room("a".into()),
            json!({"ok": true, "deny_reasons": []})
        );
        m.set_room_ok("a".into(), false);
        assert_eq!(
            m.check_room("a".into()),
            json!({"ok": false, "deny_reasons": ["revoked"]})
        );
        assert_eq!(m.check_room("b".into())["ok"], true);
        m.set_room_ok("a".into(), true);
        assert_eq!(m.check_room("a".into())["ok"], true);
    }

    #[test]
    fn clearing_records_releases_and_can_refuse() {
        let mut m = Mocks::default();
        m.authorize_release(7, "r".into(), "p".into(), "c1".into(), "M".into());
        assert_eq!(m.releases().len(), 1);
        m.set_expected_commitment(Some("c1".into()));
        m.authorize_release(7, "r".into(), "p".into(), "c1".into(), "M".into());
        assert_eq!(m.releases().len(), 2);
        m.set_release_denied(true);
        assert_eq!(m.releases().len(), 2);
    }

    #[test]
    #[should_panic(expected = "E_COMMITMENT_MISMATCH")]
    fn clearing_refuses_a_commitment_it_does_not_expect() {
        let mut m = Mocks::default();
        m.set_expected_commitment(Some("c1".into()));
        m.authorize_release(7, "r".into(), "p".into(), "other".into(), "M".into());
    }

    #[test]
    #[should_panic(expected = "E_PLATFORM_CAP")]
    fn clearing_refuses_when_told_to() {
        let mut m = Mocks::default();
        m.set_release_denied(true);
        m.authorize_release(7, "r".into(), "p".into(), "c".into(), "M".into());
    }

    #[test]
    fn the_mpc_answers_and_can_go_down() {
        let mut m = Mocks::default();
        assert_eq!(
            m.request_app_private_key(json!({"a": 1}))["big_y"],
            "bls12381g1:Yfixed"
        );
        assert_eq!(m.mpc_requests(), vec![r#"{"a":1}"#.to_string()]);
        m.set_mpc_down(true);
    }

    #[test]
    #[should_panic(expected = "mpc is down")]
    fn a_down_mpc_refuses() {
        let mut m = Mocks::default();
        m.set_mpc_down(true);
        m.request_app_private_key(json!({}));
    }
}
