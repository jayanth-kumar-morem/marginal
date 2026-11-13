//! One error enum for the whole system (SDD §4.1).
//!
//! Every refusal has a stable string code. Contracts return the code, the room and the
//! verifiers match on it, and `docs/errors.md` documents it. **A code never changes meaning and
//! is never reused.** To retire an error, stop returning it; keep the variant and its code.
//!
//! The enum, `code()`, `from_code()` and `ALL` come from one macro invocation, so they cannot
//! drift apart.

macro_rules! errors {
    ($( $(#[$doc:meta])* $variant:ident = $code:literal, )*) => {
        /// A typed refusal. See the module docs for the stability rules.
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub enum CoreError {
            $( $(#[$doc])* $variant, )*
        }

        impl CoreError {
            /// Every error, in declaration order.
            pub const ALL: &'static [CoreError] = &[ $( CoreError::$variant, )* ];

            /// The stable code, for example `"E_BUDGET_EXHAUSTED"`.
            pub const fn code(self) -> &'static str {
                match self { $( CoreError::$variant => $code, )* }
            }

            /// The error for a code, if it is one of ours.
            pub fn from_code(code: &str) -> Option<CoreError> {
                match code { $( $code => Some(CoreError::$variant), )* _ => None }
            }
        }
    };
}

errors! {
    // Listing
    ListingNotActive = "E_LISTING_NOT_ACTIVE",
    SchemaInvalid = "E_SCHEMA_INVALID",
    FreeTextField = "E_FREE_TEXT_FIELD",
    AnonSetTooSmall = "E_ANON_SET_TOO_SMALL",
    TierRequired = "E_TIER_REQUIRED",
    // Request
    BudgetExhausted = "E_BUDGET_EXHAUSTED",
    SubBudgetExhausted = "E_SUB_BUDGET_EXHAUSTED",
    NullifierUsed = "E_NULLIFIER_USED",
    SnapshotTooNew = "E_SNAPSHOT_TOO_NEW",
    SnapshotAfterPublish = "E_SNAPSHOT_AFTER_PUBLISH",
    BalanceLow = "E_BALANCE_LOW",
    AgentCap = "E_AGENT_CAP",
    NoEligibleRoom = "E_NO_ELIGIBLE_ROOM",
    /// A job cannot move from the state it is in to the one asked for (SDD §3.5).
    JobStateInvalid = "E_JOB_STATE",
    /// The snapshot a request names belongs to someone else.
    SnapshotOwner = "E_SNAPSHOT_OWNER",
    /// The credential is not signed by a registered issuer, or it has expired.
    CredentialInvalid = "E_CREDENTIAL",
    // Keys and caps
    PlatformCap = "E_PLATFORM_CAP",
    ListingReleaseCap = "E_LISTING_RELEASE_CAP",
    Paused = "E_PAUSED",
    RoomRevoked = "E_ROOM_REVOKED",
    NotPinned = "E_NOT_PINNED",
    Frozen = "E_FROZEN",
    CommitmentMismatch = "E_COMMITMENT_MISMATCH",
    // Verdicts
    BadSignature = "E_BAD_SIGNATURE",
    RoomNotAssigned = "E_ROOM_NOT_ASSIGNED",
    Binding = "E_BINDING",
    /// Verdict components or factors do not fit the schema: wrong count or out of range (AC-1, AC-11).
    Schema = "E_SCHEMA",
    RecomputeMismatch = "E_RECOMPUTE_MISMATCH",
    ProofInvalid = "E_PROOF_INVALID",
    ReceiptSigner = "E_RECEIPT_SIGNER",
    ReceiptBodyHash = "E_RECEIPT_BODY_HASH",
    ReceiptReplay = "E_RECEIPT_REPLAY",
    ModelNotAllowed = "E_MODEL_NOT_ALLOWED",
    DeliveryMissing = "E_DELIVERY_MISSING",
    CertMissing = "E_CERT_MISSING",
    // Attestation
    QuoteSig = "E_QUOTE_SIG",
    CollateralStale = "E_COLLATERAL_STALE",
    TcbStatus = "E_TCB_STATUS",
    DebugTd = "E_DEBUG_TD",
    ReportData = "E_REPORT_DATA",
    Nonce = "E_NONCE",
    Rtmr3Replay = "E_RTMR3_REPLAY",
    /// The RTMR3 event log breaks the room policy: a required event is missing or repeated, an
    /// event has the wrong payload, a forbidden event is present, or an event is not a dstack event.
    Rtmr3Events = "E_RTMR3_EVENTS",
    /// The platform's PPID is missing or not 16 bytes.
    Ppid = "E_PPID",
    /// The key-release ticket does not exist, was used, or expired.
    Ticket = "E_TICKET",
    /// The room has no attestation, or its attestation expired.
    AttestationExpired = "E_ATTESTATION_EXPIRED",
    /// A key path is not a well-formed `listing/{hash}/v{n}`.
    Path = "E_PATH",
    /// The attached deposit does not cover the storage the call creates.
    Deposit = "E_DEPOSIT",
    /// A registered room key cannot change its measurement, platform or box key.
    RoomKeyInUse = "E_ROOM_KEY_IN_USE",
    /// The locked quote verifier did not answer (the promise failed or its reply was too large).
    VerifierUnavailable = "E_VERIFIER_UNAVAILABLE",
    /// The registry did not answer.
    RegistryUnavailable = "E_REGISTRY_UNAVAILABLE",
    /// Clearing refused to authorise the release (state, caps, pause or a commitment mismatch).
    ReleaseDenied = "E_RELEASE_DENIED",
    /// The MPC network did not return the derived key. The ticket is kept until it expires.
    DeriveFailed = "E_DERIVE_FAILED",
    MeasurementNotApproved = "E_MEASUREMENT_NOT_APPROVED",
    PlatformNotAdmitted = "E_PLATFORM_NOT_ADMITTED",
    // Core: arithmetic, formats, features not built yet
    /// Division by zero, or a result that does not fit its type.
    Arithmetic = "E_ARITHMETIC",
    /// The formula exists as an enum variant but is not built in this release (SDD §3.7).
    FormulaDisabled = "E_FORMULA_DISABLED",
    /// The pricing rule exists as an enum variant but is not built in this release.
    RuleDisabled = "E_RULE_DISABLED",
    /// The display mode exists as an enum variant but is not built in this release.
    DisplayDisabled = "E_DISPLAY_DISABLED",
    /// A pricing rule's parameters are out of bounds (for example a posted price of zero).
    RuleParams = "E_RULE_PARAMS",
    /// A job's escrow does not add up: value appeared or disappeared (AC-4).
    Conservation = "E_CONSERVATION",
    /// Bytes or JSON are not a well-formed encoding of the expected type.
    Decode = "E_DECODE",
    /// A record carries a version byte this build does not understand.
    Version = "E_VERSION",
}

impl core::fmt::Display for CoreError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.code())
    }
}
