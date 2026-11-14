//! `marginal-core` as a wasm module, for the room and `replay-ts`, so they run the contract's own
//! code instead of a re-implementation.
//!
//! The whole interface is one function, [`call`]: an operation name and a JSON document in, a JSON
//! document out. Inputs and outputs follow `marginal_core::json` (amounts are decimal strings, bytes
//! are hex). The reply is `{"ok": <value>}` or `{"err": "<E_CODE>"}`, so nothing here throws and
//! every branch can be tested natively.
//!
//! [`alloc`], [`dealloc`] and [`call_raw`] are the pointer ABI the JavaScript wrapper uses. There
//! is no JS glue generator: the module imports nothing and exports these three functions and its
//! memory.

use marginal_core::attest::{
    evaluate_quote, ppid_hash, replay_rtmr3, room_events, room_pop_signing_bytes, room_report_data,
    RegisterRoomRequest, RoomBinding, Rtmr3Event,
};
use marginal_core::audit::{audit_step, AuditEntry};
use marginal_core::certificate::{
    attestation_ref, certificate_hash, forget_signing_bytes, measurement_hash, ForgetCertificateV1,
    Measurement,
};
use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::commit::{good_commitment, job_commitment, JobCore};
use marginal_core::conservation::check_conservation;
use marginal_core::credential::{
    nullifier_signing_bytes, payout_approval_signing_bytes, NullifierCredential, PayoutApproval,
};
use marginal_core::delivery::{delivery_hash, DeliveryV1};
use marginal_core::funding::{compensation, fund, total};
use marginal_core::json::{dec, hex, to_hex};
use marginal_core::judge::{binds_body, has_reasoning, parse_relevance, personal_sign_preimage};
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, path_hash, KeyRequest};
use marginal_core::leakage::{max_debit, mbits};
use marginal_core::lifecycle::transition;
use marginal_core::listing::{validate_spec, ListingSpec, PublishSpec};
use marginal_core::pricing::{apply_rule, ceiling, judgement_factor, measured_index, valuation};
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningV1,
};
use marginal_core::request::{validate_request, AppraisalRequest};
use marginal_core::settle::{settle, state_for, FeeShares};
use marginal_core::verdict::{verdict_signing_bytes, VerdictV1};
use marginal_core::verifier::VerificationResult;
use marginal_core::{
    AccountId, BlobRef, Buckets, CoreError, DisplayMode, FormulaId, FormulaParams, JobState,
    OutputSchema, PricingRule, VerdictPrivacy,
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct JudgementIn {
    l_floor: u32,
    factors: Vec<u32>,
}

#[derive(Deserialize)]
struct CeilingIn {
    formula: FormulaId,
    components: Vec<u32>,
    params: FormulaParams,
}

#[derive(Deserialize)]
struct MeasuredIn {
    #[serde(flatten)]
    ceiling: CeilingIn,
    l_floor: u32,
    factors: Vec<u32>,
}

#[derive(Deserialize)]
struct ValuationIn {
    #[serde(with = "dec")]
    budget: u128,
    m: u32,
}

#[derive(Deserialize)]
struct ApplyRuleIn {
    rule: PricingRule,
    #[serde(with = "dec")]
    budget: u128,
    m: u32,
}

#[derive(Deserialize)]
struct MbitsIn {
    n: u16,
}

#[derive(Deserialize)]
struct MaxDebitIn {
    schema: OutputSchema,
    mode: DisplayMode,
    rule: PricingRule,
    privacy: VerdictPrivacy,
    n_judges: u8,
}

#[derive(Deserialize)]
struct GoodIn {
    #[serde(with = "hex")]
    salt: [u8; 32],
    #[serde(with = "hex")]
    good: Vec<u8>,
}

#[derive(Deserialize)]
struct AuditIn {
    #[serde(with = "hex")]
    prev_head: [u8; 32],
    entry: AuditEntry,
}

#[derive(Deserialize)]
struct ConservationIn {
    #[serde(with = "dec")]
    deposit: u128,
    buckets: Buckets,
    #[serde(with = "dec")]
    moved_out: u128,
}

#[derive(Deserialize)]
struct OutcomeIn {
    outcome: marginal_core::Outcome,
}

#[derive(Deserialize)]
struct CompIn {
    price_per_bit: Dec,
    mbits: u64,
}

#[derive(Deserialize)]
struct EventsIn {
    events: Vec<Rtmr3Event>,
}

#[derive(Deserialize)]
struct ListingPathIn {
    seller: AccountId,
    listing_id: u64,
    version: u32,
}

#[derive(Deserialize)]
struct PathIn {
    path: String,
}

/// A move in the job state machine (SDD §3.5).
#[derive(Deserialize)]
struct TransitionIn {
    from: JobState,
    to: JobState,
}

/// What a job would cost to open (SDD §3.9.1).
#[derive(Deserialize)]
struct FundIn {
    budget: Dec,
    compute_fee: Dec,
    price_per_bit: Dec,
    max_debit_mbits: u64,
    clearing_fee_buyer_bps: u32,
}

#[derive(Serialize)]
struct FundOut {
    buckets: Buckets,
    total: Dec,
}

#[derive(Deserialize)]
struct BodyIn {
    body: String,
}

#[derive(Deserialize)]
struct TextIn {
    text: String,
}

#[derive(Deserialize)]
struct ReceiptIn {
    text: String,
    body: String,
}

/// A job at the moment it settles (SDD §3.9.2).
#[derive(Deserialize)]
struct SettleIn {
    outcome: marginal_core::Outcome,
    buckets: Buckets,
    price: Dec,
    price_per_bit: Dec,
    reserved_mbits: u64,
    clearing_fee_buyer_bps: u32,
    shares: FeeShares,
}

#[derive(Serialize)]
struct SettledOut {
    buckets: Buckets,
    fees: marginal_core::FeeSplit,
    seller_comp: Dec,
    operator_compute: Dec,
    refund: Dec,
    held: Dec,
    leakage_debit_mbits: u64,
    ends_in: marginal_core::JobState,
}

/// A `u128` as the decimal string the JSON model uses (`marginal_core::json::dec`).
#[derive(Deserialize, Serialize, Clone, Copy)]
struct Dec(#[serde(with = "marginal_core::json::dec")] u128);

#[derive(Deserialize)]
struct PpidIn {
    #[serde(with = "hex")]
    ppid: Vec<u8>,
}

/// A proof's public signals, as snarkjs prints them.
#[derive(Deserialize)]
struct SignalsIn {
    signals: Vec<String>,
}

/// A job commitment to split into the circuit's two limbs.
#[derive(Deserialize)]
struct LimbsIn {
    #[serde(with = "hex")]
    commitment: [u8; 32],
}

/// The two limbs, as little-endian field elements.
#[derive(Serialize)]
struct Limbs {
    hi: String,
    lo: String,
}

/// The two hashes KeyPolicy's attestation record holds, which a certificate refers to as one.
#[derive(Deserialize)]
struct AttestationRefIn {
    #[serde(with = "hex")]
    quote_hash: [u8; 32],
    #[serde(with = "hex")]
    collateral_hash: [u8; 32],
}

/// A verifier reply as the Borsh bytes it came in, plus what KeyPolicy checks it against.
#[derive(Deserialize)]
struct EvaluateIn {
    #[serde(with = "hex")]
    reply: Vec<u8>,
    events: Vec<Rtmr3Event>,
    #[serde(with = "hex")]
    report_data: [u8; 64],
    now_secs: u64,
}

#[derive(Deserialize)]
struct Bytes {
    #[serde(with = "hex")]
    bytes: Vec<u8>,
}

#[derive(Serialize)]
struct Amount(#[serde(with = "dec")] u128);

#[derive(Serialize)]
struct Hex<T: AsRef<[u8]>>(#[serde(with = "hex")] T);

/// Parses `input` as `I`, runs `f`, and renders the result as JSON.
fn run<I: DeserializeOwned, O: Serialize>(
    input: &str,
    f: impl FnOnce(I) -> Result<O, CoreError>,
) -> Result<String, CoreError> {
    let input = serde_json::from_str(input).map_err(|_| CoreError::Decode)?;
    Ok(serde_json::to_string(&f(input)?).expect("these types always serialise"))
}

/// The Borsh encoding of a JSON-described message, as hex.
fn encode<T: borsh::BorshSerialize + DeserializeOwned>(input: &str) -> Result<String, CoreError> {
    run(input, |value: T| Ok(Hex(to_bytes(&value))))
}

/// The JSON of a message from its Borsh bytes. Strict: trailing or missing bytes are `E_DECODE`.
fn decode<T: borsh::BorshDeserialize + Serialize>(input: &str) -> Result<String, CoreError> {
    run(input, |b: Bytes| from_bytes::<T>(&b.bytes))
}

fn dispatch(op: &str, input: &str) -> Result<String, CoreError> {
    match op {
        "judgement_factor" => run(input, |i: JudgementIn| {
            Ok(judgement_factor(i.l_floor, &i.factors))
        }),
        "ceiling" => run(input, |i: CeilingIn| {
            ceiling(i.formula, &i.components, &i.params)
        }),
        "measured_index" => run(input, |i: MeasuredIn| {
            measured_index(
                i.ceiling.formula,
                &i.ceiling.components,
                &i.ceiling.params,
                i.l_floor,
                &i.factors,
            )
        }),
        "valuation" => run(input, |i: ValuationIn| valuation(i.budget, i.m).map(Amount)),
        "apply_rule" => run(input, |i: ApplyRuleIn| apply_rule(&i.rule, i.budget, i.m)),
        "mbits" => run(input, |i: MbitsIn| mbits(i.n)),
        // What a verifier needs to re-check a settlement from views alone (E12.2): the state an
        // outcome must end in, and the compensation a debit owes the seller.
        "state_for" => run(input, |i: OutcomeIn| state_for(i.outcome)),
        "compensation" => run(input, |i: CompIn| {
            compensation(i.price_per_bit.0, i.mbits).map(Dec)
        }),
        "max_debit" => run(input, |i: MaxDebitIn| {
            max_debit(&i.schema, &i.mode, &i.rule, i.privacy, i.n_judges)
        }),
        "job_commitment" => run(input, |c: JobCore| Ok(Hex(job_commitment(&c)))),
        "good_commitment" => run(input, |i: GoodIn| {
            Ok(Hex(good_commitment(&i.salt, &i.good)))
        }),
        // What a seller's and a buyer's transactions carry (E12.1, E13.2, E13.4). The SDK builds
        // every argument through these, so a client cannot hand-roll a layout the contract would
        // read differently, and it runs core's own checks before anything is paid for.
        "listing_spec_encode" => encode::<ListingSpec>(input),
        "publish_spec_encode" => encode::<PublishSpec>(input),
        "appraisal_request_encode" => encode::<AppraisalRequest>(input),
        "blob_ref_encode" => encode::<BlobRef>(input),
        "validate_spec" => run(input, |spec: ListingSpec| {
            validate_spec(&spec).map(|()| true)
        }),
        "validate_request" => run(input, |r: AppraisalRequest| {
            validate_request(&r).map(|()| true)
        }),
        "verdict_encode" => encode::<VerdictV1>(input),
        "verdict_decode" => decode::<VerdictV1>(input),
        "verdict_signing_bytes" => run(input, |v: VerdictV1| Ok(Hex(verdict_signing_bytes(&v)))),
        "certificate_encode" => encode::<ForgetCertificateV1>(input),
        "certificate_decode" => decode::<ForgetCertificateV1>(input),
        "certificate_signing_bytes" => run(input, |c: ForgetCertificateV1| {
            Ok(Hex(forget_signing_bytes(&c)))
        }),
        "certificate_hash" => run(input, |c: ForgetCertificateV1| {
            Ok(Hex(certificate_hash(&c)))
        }),
        "delivery_encode" => encode::<DeliveryV1>(input),
        "delivery_decode" => decode::<DeliveryV1>(input),
        "delivery_hash" => run(input, |d: DeliveryV1| Ok(Hex(delivery_hash(&d)))),
        "room_report_data" => run(input, |b: RoomBinding| Ok(Hex(room_report_data(&b)))),
        "room_pop_signing_bytes" => {
            run(input, |b: RoomBinding| Ok(Hex(room_pop_signing_bytes(&b))))
        }
        "rtmr3_replay" => run(input, |i: EventsIn| replay_rtmr3(&i.events).map(Hex)),
        "room_events" => run(input, |i: EventsIn| room_events(&i.events)),
        "evaluate_quote" => run(input, |i: EvaluateIn| {
            evaluate_quote(
                &from_bytes::<VerificationResult>(&i.reply)?,
                &i.events,
                &i.report_data,
                i.now_secs,
            )
        }),
        "register_room_encode" => encode::<RegisterRoomRequest>(input),
        // The registry's policy, encoded for governance and for the deploy script's seed step (E14.4).
        "measurement_set_encode" => encode::<marginal_core::attest::MeasurementSet>(input),
        // A room with no quote, which only `keypolicy-sim` accepts (SDD §6.1).
        "sim_room_encode" => encode::<marginal_core::attest::SimRoom>(input),
        "key_request_encode" => encode::<KeyRequest>(input),
        // The room's `Assigned → Computing` ack, for a listing clearing sees no key release for
        // (SDD §3.5, §3.12.7; E14.4).
        "room_ack_signing_bytes" => run(input, |a: marginal_core::lifecycle::RoomAckV1| {
            Ok(Hex(marginal_core::lifecycle::room_ack_signing_bytes(&a)))
        }),
        "room_ack_encode" => encode::<marginal_core::lifecycle::RoomAckV1>(input),
        "key_request_decode" => decode::<KeyRequest>(input),
        "provisioning_encode" => encode::<ProvisioningV1>(input),
        "screening_encode" => encode::<ScreeningV1>(input),
        "key_request_signing_bytes" => run(input, |r: KeyRequest| {
            Ok(Hex(key_request_signing_bytes(&r)))
        }),
        "listing_path" => run(input, |i: ListingPathIn| {
            Ok(listing_path(&i.seller, i.listing_id, i.version))
        }),
        "path_hash" => run(input, |i: PathIn| Ok(Hex(path_hash(&i.path)))),
        "provisioning_signing_bytes" => run(input, |r: ProvisioningV1| {
            Ok(Hex(provisioning_signing_bytes(&r)))
        }),
        "screening_signing_bytes" => {
            run(input, |r: ScreeningV1| Ok(Hex(screening_signing_bytes(&r))))
        }
        "nullifier_signing_bytes" => run(input, |c: NullifierCredential| {
            Ok(Hex(nullifier_signing_bytes(&c)))
        }),
        "job_transition" => run(input, |i: TransitionIn| transition(i.from, i.to)),
        "fund" => run(input, |i: FundIn| {
            let buckets = fund(
                i.budget.0,
                i.compute_fee.0,
                i.price_per_bit.0,
                i.max_debit_mbits,
                i.clearing_fee_buyer_bps,
            )?;
            Ok(FundOut {
                total: Dec(total(&buckets)?),
                buckets,
            })
        }),
        "parse_relevance" => run(input, |i: BodyIn| Ok(parse_relevance(&i.body))),
        "judge_body_ok" => run(input, |i: BodyIn| Ok(!has_reasoning(&i.body))),
        "receipt_binds_body" => run(input, |i: ReceiptIn| Ok(binds_body(&i.text, &i.body))),
        "personal_sign_preimage" => {
            run(input, |i: TextIn| Ok(Hex(personal_sign_preimage(&i.text))))
        }
        "settle" => run(input, |i: SettleIn| {
            let settled = settle(
                i.outcome,
                &i.buckets,
                i.price.0,
                i.price_per_bit.0,
                i.reserved_mbits,
                i.clearing_fee_buyer_bps,
                i.shares,
            )?;
            Ok(SettledOut {
                buckets: settled.buckets,
                seller_comp: Dec(settled.seller_comp),
                operator_compute: Dec(settled.operator_compute),
                refund: Dec(settled.refund),
                held: Dec(settled.held),
                leakage_debit_mbits: settled.leakage_debit_mbits,
                fees: settled.fees,
                // `settle` above refused every outcome that has no end state.
                ends_in: state_for(i.outcome).expect("a settleable outcome"),
            })
        }),
        "payout_approval_signing_bytes" => run(input, |a: PayoutApproval| {
            Ok(Hex(payout_approval_signing_bytes(&a)))
        }),
        "measurement_hash" => run(input, |m: Measurement| Ok(Hex(measurement_hash(&m)))),
        "ppid_hash" => run(input, |i: PpidIn| Ok(Hex(ppid_hash(&i.ppid)))),
        "groth16_vkey_prepare" => run(input, |k: marginal_core::groth16::VerifyingKeyJson| {
            Ok(Hex(k.prepare()?))
        }),
        "groth16_proof_encode" => run(input, |p: marginal_core::groth16::ProofJson| {
            Ok(Hex(p.encode()?))
        }),
        "groth16_inputs_encode" => run(input, |i: SignalsIn| {
            Ok(Hex(marginal_core::groth16::encode_inputs(&i.signals)?))
        }),
        "commitment_limbs" => run(input, |i: LimbsIn| {
            let (hi, lo) = marginal_core::groth16::commitment_limbs(&i.commitment);
            Ok(Limbs {
                hi: to_hex(&hi),
                lo: to_hex(&lo),
            })
        }),
        "attestation_ref" => run(input, |i: AttestationRefIn| {
            Ok(Hex(attestation_ref(&i.quote_hash, &i.collateral_hash)))
        }),
        "audit_step" => run(input, |i: AuditIn| {
            Ok(Hex(audit_step(&i.prev_head, &i.entry)))
        }),
        "check_conservation" => run(input, |i: ConservationIn| {
            check_conservation(i.deposit, &i.buckets, i.moved_out)
        }),
        _ => Err(CoreError::Decode),
    }
}

/// Runs one operation. The reply is `{"ok": <value>}` or `{"err": "<E_CODE>"}`. An unknown
/// operation, and input that is not valid JSON for the operation, give `E_DECODE`.
pub fn call(op: &str, input: &str) -> String {
    match dispatch(op, input) {
        Ok(json) => format!("{{\"ok\":{json}}}"),
        Err(error) => format!("{{\"err\":\"{}\"}}", error.code()),
    }
}

/// Reserves `len` bytes in the module's memory for the caller to fill. Free them with [`dealloc`].
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

/// Frees memory from [`alloc`], or a reply from [`call_raw`].
///
/// # Safety
/// `ptr` and `len` must be exactly what [`alloc`] or [`call_raw`] gave (for a reply, `len` is
/// 4 plus its length prefix), and must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

/// [`call`] over memory: the operation and the input as UTF-8 bytes. Returns a pointer to the reply,
/// laid out as a 4-byte little-endian length followed by that many bytes of JSON. Text that is not
/// UTF-8 is an unknown operation.
///
/// # Safety
/// `op` and `input` must point to `op_len` and `input_len` readable bytes (from [`alloc`]).
#[no_mangle]
pub unsafe extern "C" fn call_raw(
    op: *const u8,
    op_len: usize,
    input: *const u8,
    input_len: usize,
) -> *mut u8 {
    let op = std::slice::from_raw_parts(op, op_len);
    let input = std::slice::from_raw_parts(input, input_len);
    let reply = match (std::str::from_utf8(op), std::str::from_utf8(input)) {
        (Ok(op), Ok(input)) => call(op, input),
        _ => call("", ""),
    };
    let mut out = Vec::with_capacity(4 + reply.len());
    out.extend((reply.len() as u32).to_le_bytes());
    out.extend(reply.as_bytes());
    Box::into_raw(out.into_boxed_slice()) as *mut u8
}
