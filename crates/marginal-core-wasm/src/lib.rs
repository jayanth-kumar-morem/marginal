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
    certificate_hash, forget_signing_bytes, measurement_hash, ForgetCertificateV1, Measurement,
};
use marginal_core::codec::{from_bytes, to_bytes};
use marginal_core::commit::{good_commitment, job_commitment, JobCore};
use marginal_core::conservation::check_conservation;
use marginal_core::delivery::{delivery_hash, DeliveryV1};
use marginal_core::json::{dec, hex};
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, path_hash, KeyRequest};
use marginal_core::leakage::{max_debit, mbits};
use marginal_core::pricing::{apply_rule, ceiling, judgement_factor, measured_index, valuation};
use marginal_core::verdict::{verdict_signing_bytes, VerdictV1};
use marginal_core::verifier::VerificationResult;
use marginal_core::{
    AccountId, Buckets, CoreError, DisplayMode, FormulaId, FormulaParams, OutputSchema,
    PricingRule, VerdictPrivacy,
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

#[derive(Deserialize)]
struct PpidIn {
    #[serde(with = "hex")]
    ppid: Vec<u8>,
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
        "max_debit" => run(input, |i: MaxDebitIn| {
            max_debit(&i.schema, &i.mode, &i.rule, i.privacy, i.n_judges)
        }),
        "job_commitment" => run(input, |c: JobCore| Ok(Hex(job_commitment(&c)))),
        "good_commitment" => run(input, |i: GoodIn| {
            Ok(Hex(good_commitment(&i.salt, &i.good)))
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
        "key_request_signing_bytes" => run(input, |r: KeyRequest| {
            Ok(Hex(key_request_signing_bytes(&r)))
        }),
        "listing_path" => run(input, |i: ListingPathIn| {
            Ok(listing_path(&i.seller, i.listing_id, i.version))
        }),
        "path_hash" => run(input, |i: PathIn| Ok(Hex(path_hash(&i.path)))),
        "measurement_hash" => run(input, |m: Measurement| Ok(Hex(measurement_hash(&m)))),
        "ppid_hash" => run(input, |i: PpidIn| Ok(Hex(ppid_hash(&i.ppid)))),
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
