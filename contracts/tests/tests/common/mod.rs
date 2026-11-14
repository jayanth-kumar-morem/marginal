//! The world every cross-contract suite runs in (SDD §5.2, E14.1).
//!
//! One local chain carrying the real clearing, the real KeyPolicy in its `sim-attestation` build
//! (`keypolicy-sim`, so a room can register without a TDX quote), the locked tee-verifier KeyPolicy
//! is pointed at, the mock MPC network it derives through, `musdc` as the settlement token, and a
//! test signing key playing the room. Nothing here is a double for a contract that exists: clearing
//! and KeyPolicy are the built wasm, and every signature is real.
//!
//! The scripts the suites replay are the ones the room's worker sends (`room/src/worker/`) and the
//! ones clearing's unit tests build in process (`contracts/clearing/src/tests/`), so a figure that
//! holds here holds there.

// No single suite uses every part of the world.
#![allow(dead_code)]

use anyhow::Result;
use ed25519_dalek::{Signer, SigningKey};
use marginal_core::attest::{ppid_hash, SimRoom};
use marginal_core::certificate::measurement_hash;
use marginal_core::codec::{hash_of, to_bytes};
use marginal_core::credential::{
    nullifier_signing_bytes, payout_approval_signing_bytes, NullifierCredential, PayoutApproval,
};
use marginal_core::json::{parse_hex, to_hex};
use marginal_core::judge::{personal_sign_preimage, BPS_PER_POINT};
use marginal_core::keyrelease::{key_request_signing_bytes, listing_path, AppKey, KeyRequest};
use marginal_core::listing::{ListingSpec, PublishSpec};
use marginal_core::reports::{
    provisioning_signing_bytes, screening_signing_bytes, ProvisioningV1, ScreeningResult,
    ScreeningV1,
};
use marginal_core::request::AppraisalRequest;
use marginal_core::verdict::{
    verdict_signing_bytes, JudgeFactor, ModelProof, OpenBody, VerdictStatus, VerdictV1,
};
use marginal_core::{
    BlobRef, DisplayMode, PayoutRoute, RefundRoute, RoomClass, ValueClass, VerdictPrivacy,
};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

use clearing::{MeasurementSet, LISTING_FEE, PLATFORM_FEE, PUBLISH_FEE, SET_FEE};

/// The sample records every implementation shares, so a listing or a measurement here is the one
/// `fixtures/vectors.json` was generated from.
#[path = "../../../../crates/marginal-core/tests/common/mod.rs"]
pub mod samples;

/// The chain id every signature in these suites is bound to.
pub const CHAIN_ID: &str = "sandbox";

/// The platform the room runs on (16 bytes, SDD §3.13).
const PPID: [u8; 16] = [0x77; 16];

/// The appraiser's fee class: what the `compute` bucket is funded with (§3.9.1).
pub const COMPUTE_FEE: u128 = 1_000_000;

/// The clearing fee, in basis points of the price (buyer's share) and of the proceeds (seller's).
pub const FEE_BUYER_BPS: u32 = 50;
pub const FEE_SELLER_BPS: u32 = 100;

/// How the fee is split, in basis points of the fee.
pub const TREASURY_BPS: u32 = 6_000;
pub const OPERATOR_POOL_BPS: u32 = 3_000;
pub const ASSURANCE_POOL_BPS: u32 = 1_000;

/// What each buyer is minted, in musdc's smallest unit (6 decimals).
pub const MINT: u128 = 10_000_000_000;

/// What every verdict in these suites commits to delivering.
pub const DELIVERY_HASH: [u8; 32] = [0xd1; 32];

/// The model the registered NEAR AI signer signs for.
pub const MODEL: &str = "Qwen/Qwen3.8-27B";

fn target_dir() -> String {
    std::env::var("CARGO_TARGET_DIR")
        .unwrap_or_else(|_| format!("{}/../../target", env!("CARGO_MANIFEST_DIR")))
}

/// A contract's built wasm. `make wasm-dev` writes these, and `make e2e` runs it first.
pub fn wasm(name: &str, file: &str) -> Vec<u8> {
    let path = format!("{}/near/{name}/{file}.wasm", target_dir());
    std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}; run `make wasm-dev`"))
}

/// A storage fee a contract declares, as the amount near-workspaces attaches.
pub fn fee(f: near_sdk::NearToken) -> NearToken {
    NearToken::from_yoctonear(f.as_yoctonear())
}

pub fn no_deposit() -> NearToken {
    NearToken::from_yoctonear(0)
}

pub fn b64(bytes: &[u8]) -> String {
    use near_sdk::base64::Engine as _;
    near_sdk::base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub async fn subaccount(root: &Account, name: &str, balance: u128) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(balance))
        .transact()
        .await?
        .into_result()?)
}

/// One transaction, with all the gas a sandbox call can carry.
pub async fn call(
    who: &Account,
    to: &Contract,
    method: &str,
    args: Value,
    deposit: NearToken,
) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(to.id(), method)
        .args_json(args)
        .deposit(deposit)
        .gas(Gas::from_tgas(300))
        .transact()
        .await?)
}

pub async fn view(contract: &Contract, method: &str, args: Value) -> Result<Value> {
    Ok(contract.view(method).args_json(args).await?.json()?)
}

/// Every failure message of a transaction and its receipts.
pub fn failures(result: &ExecutionFinalResult) -> String {
    result
        .failures()
        .iter()
        .map(|f| format!("{f:?}"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// The transaction must have failed, with this error code somewhere in its receipts.
pub fn assert_refused(result: &ExecutionFinalResult, code: &str) {
    assert!(result.is_failure(), "expected {code}, but it succeeded");
    assert!(
        failures(result).contains(code),
        "expected {code} in:\n{}",
        failures(result)
    );
}

/// The transaction must have succeeded; its JSON answer is returned.
pub fn succeeded(result: ExecutionFinalResult) -> Result<Value> {
    assert!(result.is_success(), "{}", failures(&result));
    Ok(result.json()?)
}

/// The room's signing key: the one a real room would hold inside the enclave.
pub fn room_signing_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

pub fn room_key() -> [u8; 32] {
    room_signing_key().verifying_key().to_bytes()
}

/// A signature the room makes, as the base64 the contracts take.
pub fn sign_as_room(message: &[u8]) -> String {
    b64(&room_signing_key().sign(message).to_bytes())
}

/// The compliance service's key, which signs payout approvals (AC-47).
pub fn compliance_key() -> SigningKey {
    SigningKey::from_bytes(&[4; 32])
}

/// The credential issuer's key, which signs nullifier credentials (AC-14).
pub fn issuer_key() -> SigningKey {
    SigningKey::from_bytes(&[6; 32])
}

/// The NEAR AI judge's secp256k1 key, and the Ethereum address a receipt of its recovers to.
fn judge_key() -> secp256k1::SecretKey {
    secp256k1::SecretKey::from_slice(&[0x42; 32]).expect("a valid scalar")
}

pub fn judge_address() -> [u8; 20] {
    let secp = secp256k1::Secp256k1::new();
    let public = secp256k1::PublicKey::from_secret_key(&secp, &judge_key());
    let digest = near_sdk::env::keccak256_array(&public.serialize_uncompressed()[1..]);
    digest[12..].try_into().expect("20 bytes")
}

/// A receipt the provider's TEE could have signed for `body`, claiming `factor_bps`.
///
/// `chat` makes each receipt distinct: a receipt's text may be used once (§3.16), so two verdicts
/// cannot carry the same one.
pub fn receipt(factor_bps: u32, body: &str, chat: u64) -> JudgeFactor {
    let text = format!(
        "chat-{chat} model={MODEL} response={}",
        to_hex(&marginal_core::codec::sha256(&[body.as_bytes()]))
    );
    let secp = secp256k1::Secp256k1::new();
    let hash = near_sdk::env::keccak256_array(&personal_sign_preimage(&text)[..]);
    let (recovery, signature) = secp
        .sign_ecdsa_recoverable(
            &secp256k1::Message::from_slice(&hash).expect("32 bytes"),
            &judge_key(),
        )
        .serialize_compact();
    let mut sig65 = [0u8; 65];
    sig65[..64].copy_from_slice(&signature);
    sig65[64] = recovery.to_i32() as u8;
    JudgeFactor {
        model_id: MODEL.into(),
        factor_bps,
        proof: ModelProof::NearAiReceipt {
            text,
            sig65,
            response_body: body.to_string(),
        },
    }
}

/// A judge that answered `relevance` out of ten, the way the room publishes it.
pub fn judged(relevance: u32, chat: u64) -> JudgeFactor {
    receipt(
        relevance * BPS_PER_POINT,
        &format!("{{\"relevance\":{relevance}}}"),
        chat,
    )
}

/// An id or an amount a contract answered with: both cross the interface as decimal strings, so
/// JavaScript cannot round them (SDD §3.3).
pub fn id_of(answer: &Value) -> u64 {
    answer
        .as_str()
        .expect("a decimal string")
        .parse()
        .expect("a number")
}

/// A job's commitment, out of its view: the room and KeyPolicy both have to carry it back exactly,
/// or clearing refuses what they ask for.
pub fn commitment_of(job: &Value) -> [u8; 32] {
    parse_hex(job["job_commitment"].as_str().expect("a commitment")).expect("32 bytes")
}

/// Unwraps an answer from `marginal-core`. Its errors are `no_std`, so `?` cannot carry them into
/// `anyhow`, and a suite that cannot work out the figure it means to assert has nothing left to
/// check: failing on the spot says so plainly.
pub fn core_ok<T>(answer: core::result::Result<T, marginal_core::CoreError>) -> T {
    answer.expect("marginal-core worked out the figure this suite asserts")
}

/// The posted price of a listing, from core's own rule reader.
pub fn ask(spec: &ListingSpec) -> u128 {
    marginal_core::pricing::min_price(&spec.rule).expect("R1 is the rule M1 builds")
}

/// What a buyer asks for: an Open, Blind appraisal of `listing_id` with `n_judges` judges.
pub fn appraisal(listing_id: u64, budget: u128, n_judges: u8) -> AppraisalRequest {
    AppraisalRequest {
        listing_id,
        listing_version: 1,
        snapshot_id: None,
        budget,
        mode: DisplayMode::Blind,
        privacy: VerdictPrivacy::Open,
        n_judges,
        delivery_pk: [0x11; 32],
        compliance_pk: None,
        context_auth_pk: [0x22; 32],
        sealed_context_key: vec![7, 7, 7],
        refund_to: RefundRoute::Balance,
        nullifier: None,
        nullifier_sig: None,
    }
}

pub struct World {
    pub worker: Worker<Sandbox>,
    pub clearing: Contract,
    pub keypolicy: Contract,
    /// The mock MPC network KeyPolicy derives listing keys through.
    pub mpc: Contract,
    /// The locked quote verifier KeyPolicy is pointed at, as its real built wasm. The simulated
    /// registration path does not call it; it is here so the world is wired as the demo is.
    pub verifier: Contract,
    pub token: Contract,
    pub gov: Account,
    pub seller: Account,
    pub operator: Account,
    pub buyers: Vec<Account>,
}

/// The whole world: every contract deployed and initialised, governance policy seeded, the room
/// registered through `register_room_simulated`, and `buyers` funded buyer accounts.
pub async fn world(buyers: usize) -> Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let gov = subaccount(&root, "gov", 50).await?;
    let clearing = subaccount(&root, "clearing", 50)
        .await?
        .deploy(&wasm("clearing", "clearing"))
        .await?
        .into_result()?;
    let keypolicy = subaccount(&root, "keypolicy", 50)
        .await?
        .deploy(&wasm("keypolicy-sim", "keypolicy"))
        .await?
        .into_result()?;
    let mpc = subaccount(&root, "mpc", 50)
        .await?
        .deploy(&wasm("mocks", "mocks"))
        .await?
        .into_result()?;
    let verifier = subaccount(&root, "verifier", 50)
        .await?
        .deploy(&std::fs::read(samples::fixture("tee-verifier.wasm"))?)
        .await?
        .into_result()?;
    let token = subaccount(&root, "musdc", 50)
        .await?
        .deploy(&wasm("musdc", "musdc"))
        .await?
        .into_result()?;

    clearing
        .call("new")
        .args_json(json!({
            "gov": gov.id(),
            "keypolicy": keypolicy.id(),
            "chain_id": CHAIN_ID,
            "tokens": [token.id()],
            "profile": {
                "profile": "sandbox",
                "gov_profile": "demo",
                "cooling_blocks": 0,
                // The sandbox clock follows its blocks, so a ten-minute challenge window would cost
                // thousands of blocks to wait out. Its length is a profile value; what the suites
                // exercise is that it is enforced at all.
                "challenge_window_secs": 5,
                "rules_enabled": ["R1"],
                "asset_classes_enabled": ["Knowledge", "Dataset"],
            },
        }))
        .transact()
        .await?
        .into_result()?;
    keypolicy
        .call("new")
        .args_json(json!({
            "chain_id": CHAIN_ID,
            "registry": clearing.id(),
            "clearing": clearing.id(),
            "mpc": mpc.id(),
            "ckd_domain_id": 2,
            "dcap_verifier": verifier.id(),
        }))
        .transact()
        .await?
        .into_result()?;
    token
        .call("new")
        .args_json(json!({ "faucet": gov.id() }))
        .transact()
        .await?
        .into_result()?;

    let mut w = World {
        seller: subaccount(&root, "seller", 50).await?,
        operator: subaccount(&root, "operator", 50).await?,
        buyers: vec![],
        worker,
        clearing,
        keypolicy,
        mpc,
        verifier,
        token,
        gov,
    };
    w.seed_policy().await?;
    w.register_room().await?;

    // Clearing holds the escrow, and the seller and the operator are paid in tokens, so all three
    // need a storage entry in the token before anything can be transferred to them.
    for who in [w.clearing.id(), w.seller.id(), w.operator.id()] {
        call(
            &w.gov,
            &w.token,
            "storage_deposit",
            json!({ "account_id": who }),
            NearToken::from_millinear(10),
        )
        .await?
        .into_result()?;
    }
    for i in 0..buyers {
        let buyer = w.fund_buyer(&root, &format!("buyer{i}")).await?;
        w.buyers.push(buyer);
    }
    Ok(w)
}

impl World {
    /// Governance approves the room's software and its platform, registers the appraiser, the
    /// judge's signer and the two credential keys, and sets the fee table.
    async fn seed_policy(&self) -> Result<()> {
        let set = MeasurementSet {
            id: "knowledge-room@1.0.0".into(),
            members: vec![samples::measurement(false)],
            source_tag: "v0.1.0 abcdef".into(),
        };
        // The set crosses the interface as Borsh, like every argument that carries core's types.
        call(
            &self.gov,
            &self.clearing,
            "approve_measurement_set",
            json!({ "set": b64(&near_sdk::borsh::to_vec(&set)?) }),
            fee(SET_FEE),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "admit_platform",
            json!({
                "ppid": hex::encode(PPID),
                "operator": self.operator.id(),
                "cap_per_epoch": "1000000000000",
            }),
            fee(PLATFORM_FEE),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "set_appraiser",
            json!({
                "id": "knowledge",
                "version": 1,
                "formula": "KnowledgeV1",
                "compute_fee": COMPUTE_FEE.to_string(),
                "enabled": true,
            }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "set_fees",
            json!({ "fees": {
                "clearing_fee_buyer_bps": FEE_BUYER_BPS,
                "clearing_fee_seller_bps": FEE_SELLER_BPS,
                "treasury_bps": TREASURY_BPS,
                "operator_pool_bps": OPERATOR_POOL_BPS,
                "assurance_pool_bps": ASSURANCE_POOL_BPS,
            }}),
            no_deposit(),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "set_ai_signer",
            json!({
                "address": to_hex(&judge_address()),
                "model": MODEL,
                "expires_at": self.now_secs().await? + 3_600,
            }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "set_compliance_key",
            json!({ "key": to_hex(&compliance_key().verifying_key().to_bytes()) }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        call(
            &self.gov,
            &self.clearing,
            "set_issuer_key",
            json!({ "key": to_hex(&issuer_key().verifying_key().to_bytes()) }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        Ok(())
    }

    /// The operator registers the room: KeyPolicy records a simulated attestation and the registry
    /// inside clearing admits it. This is the one simulated element of the world (§6.1).
    async fn register_room(&self) -> Result<()> {
        let nonce: String = call(
            &self.operator,
            &self.keypolicy,
            "issue_nonce",
            json!({}),
            fee(keypolicy::NONCE_FEE),
        )
        .await?
        .json()?;
        let room = SimRoom {
            sign_pk: room_key(),
            box_pk: [2; 32],
            nonce: hex::decode(nonce)?
                .try_into()
                .map_err(|_| anyhow::anyhow!("a 32-byte nonce"))?,
            class: RoomClass::Kcpu,
            measurement: samples::measurement(false),
            ppid_hash: ppid_hash(&PPID),
        };
        let registered = call(
            &self.operator,
            &self.keypolicy,
            "register_room_simulated",
            json!({ "request": b64(&to_bytes(&room)) }),
            fee(keypolicy::ATTESTATION_FEE),
        )
        .await?;
        assert!(registered.is_success(), "{}", failures(&registered));
        Ok(())
    }

    /// One buyer with test dollars deposited into clearing's escrow (§3.9.3 path 1).
    async fn fund_buyer(&self, root: &Account, name: &str) -> Result<Account> {
        let buyer = subaccount(root, name, 20).await?;
        call(
            &self.gov,
            &self.token,
            "mint",
            json!({ "account_id": buyer.id(), "amount": MINT.to_string() }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        call(
            &buyer,
            &self.token,
            "ft_transfer_call",
            json!({
                "receiver_id": self.clearing.id(),
                "amount": MINT.to_string(),
                "msg": json!({"Deposit": {"account": buyer.id()}}).to_string(),
            }),
            NearToken::from_yoctonear(1),
        )
        .await?
        .into_result()?;
        assert_eq!(self.balance(&buyer).await?, MINT, "the deposit landed");
        Ok(buyer)
    }

    pub fn buyer(&self, i: usize) -> &Account {
        self.buyers.get(i).expect("the world has that many buyers")
    }

    /// The listing spec the suites start from: core's sample, priced in this world's token.
    pub fn spec(&self) -> ListingSpec {
        ListingSpec {
            token: self.token.id().to_string(),
            ..samples::spec()
        }
    }

    /// An amount a view returns as a decimal string, so JavaScript cannot round it.
    async fn amount(&self, method: &str, who: &Account) -> Result<u128> {
        let raw = view(
            &self.clearing,
            method,
            json!({ "account": who.id(), "token": self.token.id() }),
        )
        .await?;
        Ok(raw.as_str().expect("a decimal string").parse()?)
    }

    /// What a buyer has deposited and not yet spent (§3.9.3).
    pub async fn balance(&self, who: &Account) -> Result<u128> {
        self.amount("get_balance", who).await
    }

    /// What settlement owes an account and `claim` would pay out (§3.9.4).
    pub async fn claimable(&self, who: &Account) -> Result<u128> {
        self.amount("get_claimable", who).await
    }

    pub async fn job(&self, job_id: u64) -> Result<Value> {
        view(
            &self.clearing,
            "get_job",
            json!({ "job_id": job_id.to_string() }),
        )
        .await
    }

    pub async fn listing(&self, listing_id: u64) -> Result<Value> {
        view(
            &self.clearing,
            "get_listing",
            json!({ "listing_id": listing_id.to_string() }),
        )
        .await
    }

    pub async fn settlement(&self, job_id: u64) -> Result<Value> {
        view(
            &self.clearing,
            "get_settlement",
            json!({ "job_id": job_id.to_string() }),
        )
        .await
    }

    pub async fn leakage(&self, listing_id: u64) -> Result<Value> {
        view(
            &self.clearing,
            "get_leakage",
            json!({ "listing_id": listing_id.to_string() }),
        )
        .await
    }

    pub async fn height(&self) -> Result<u64> {
        Ok(self.worker.view_block().await?.height())
    }

    pub async fn now_secs(&self) -> Result<u64> {
        Ok(self.worker.view_block().await?.timestamp() / 1_000_000_000)
    }

    /// Waits until the chain is past `height`.
    pub async fn fast_forward_past(&self, height: u64) -> Result<()> {
        let now = self.height().await?;
        if height >= now {
            self.worker.fast_forward(height + 2 - now).await?;
        }
        Ok(())
    }

    /// A listing taken through the whole seller path on the real contracts: created, provisioned
    /// and published with the room's own signed reports, then screened with `screening`.
    ///
    /// The seller pins the room's measurement in KeyPolicy before publishing, which is the order
    /// the SDK uses: KeyPolicy denies every release for a listing with no pins.
    pub async fn list(&self, spec: &ListingSpec, screening: ScreeningResult) -> Result<u64> {
        let listing_id = id_of(&succeeded(
            call(
                &self.seller,
                &self.clearing,
                "create_listing",
                json!({ "spec": b64(&to_bytes(spec)) }),
                fee(LISTING_FEE),
            )
            .await?,
        )?);
        call(
            &self.seller,
            &self.keypolicy,
            "set_pins",
            json!({
                "listing_id": listing_id.to_string(),
                "version": 1,
                "pins": [to_hex(&measurement_hash(&samples::measurement(false)))],
            }),
            fee(keypolicy::PINS_FEE),
        )
        .await?
        .into_result()?;

        let job_id = id_of(&succeeded(
            call(
                &self.seller,
                &self.clearing,
                "begin_provisioning",
                json!({ "listing_id": listing_id.to_string() }),
                no_deposit(),
            )
            .await?,
        )?);
        let report = ProvisioningV1 {
            domain: ProvisioningV1::DOMAIN,
            chain_id: CHAIN_ID.into(),
            clearing: self.clearing.id().to_string(),
            job_id,
            listing_id,
            listing_version: 1,
            room_key: room_key(),
            pk_l: [0x5a; 32],
            cert_hash: [0x6b; 32],
        };
        call(
            &self.operator,
            &self.clearing,
            "submit_provisioning",
            json!({
                "report": b64(&to_bytes(&report)),
                "sig": sign_as_room(&provisioning_signing_bytes(&report)),
            }),
            no_deposit(),
        )
        .await?
        .into_result()?;

        let publish = PublishSpec {
            good_commitment: [0xab; 32],
            ciphertext: BlobRef {
                uri_hash: [1; 32],
                sha256: [2; 32],
                size_class: 3,
            },
            payout: PayoutRoute::NearAccount(self.seller.id().to_string()),
        };
        let screening_job = id_of(&succeeded(
            call(
                &self.seller,
                &self.clearing,
                "publish_listing",
                json!({
                    "listing_id": listing_id.to_string(),
                    "publish": b64(&to_bytes(&publish)),
                }),
                fee(PUBLISH_FEE),
            )
            .await?,
        )?);
        let report = ScreeningV1 {
            domain: ScreeningV1::DOMAIN,
            chain_id: CHAIN_ID.into(),
            clearing: self.clearing.id().to_string(),
            job_id: screening_job,
            listing_id,
            listing_version: 1,
            room_key: room_key(),
            result: screening,
            cert_hash: [0x7c; 32],
        };
        call(
            &self.operator,
            &self.clearing,
            "submit_screening",
            json!({
                "report": b64(&to_bytes(&report)),
                "sig": sign_as_room(&screening_signing_bytes(&report)),
            }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        Ok(listing_id)
    }

    /// A listing a buyer can appraise: screened `Pass`, so `Active`.
    pub async fn active_listing(&self, spec: &ListingSpec) -> Result<u64> {
        let id = self.list(spec, ScreeningResult::Pass).await?;
        assert_eq!(self.listing(id).await?["status"], "Active");
        Ok(id)
    }

    /// A buyer asks for an appraisal, funded from its balance.
    pub async fn request(
        &self,
        buyer: &Account,
        request: &AppraisalRequest,
    ) -> Result<ExecutionFinalResult> {
        call(
            buyer,
            &self.clearing,
            "request_appraisal",
            json!({ "request": b64(&to_bytes(request)) }),
            no_deposit(),
        )
        .await
    }

    /// The job id of a request that was created (not parked and not blocked).
    pub async fn created(&self, buyer: &Account, request: &AppraisalRequest) -> Result<u64> {
        let answer = succeeded(self.request(buyer, request).await?)?;
        assert_eq!(answer["status"], "Created", "{answer}");
        Ok(id_of(&answer["job_id"]))
    }

    /// The room asks KeyPolicy for the listing key, which is what moves the job to `Computing`.
    /// KeyPolicy's wasm is fixed, so this is the real `check_room` and `authorize_release` pair.
    /// Returns the ticket the room can spend on the MPC network.
    pub async fn authorize(&self, job_id: u64) -> Result<ExecutionFinalResult> {
        let job = self.job(job_id).await?;
        let listing_id = job["listing_id"].as_u64().expect("a listing id");
        let listing = self.listing(listing_id).await?;
        let request = KeyRequest {
            chain_id: CHAIN_ID.into(),
            keypolicy: self.keypolicy.id().to_string(),
            room_key: room_key(),
            job_id,
            path: listing_path(&self.seller.id().to_string(), listing_id, 1),
            app_key: AppKey {
                pk1: [5; 48],
                pk2: [6; 96],
            },
            job_commitment: commitment_of(&job),
            value_class: serde_json::from_value::<ValueClass>(listing["value_class"].clone())?,
        };
        call(
            &self.operator,
            &self.keypolicy,
            "authorize",
            json!({
                "request": b64(&to_bytes(&request)),
                "room_sig": b64(&room_signing_key()
                    .sign(&key_request_signing_bytes(&request))
                    .to_bytes()),
            }),
            fee(keypolicy::TICKET_FEE),
        )
        .await
    }

    /// The key release, from the room's request to the derived key: the ticket id it produced.
    pub async fn release_key(&self, job_id: u64) -> Result<u64> {
        let ticket = succeeded(self.authorize(job_id).await?)?;
        assert_eq!(self.job(job_id).await?["state"], "Computing");
        Ok(id_of(&ticket))
    }

    /// Spends a ticket on the MPC network, which answers as the real one does after its yield.
    pub async fn derive(&self, ticket_id: u64) -> Result<Value> {
        succeeded(
            call(
                &self.operator,
                &self.keypolicy,
                "derive",
                json!({ "ticket_id": ticket_id.to_string() }),
                no_deposit(),
            )
            .await?,
        )
    }

    /// What the room reports, signed with the room's key. `components` are the formula's inputs in
    /// basis points and `factors` the judges' receipts.
    pub async fn verdict(
        &self,
        job_id: u64,
        status: VerdictStatus,
        components: Vec<u32>,
        factors: Vec<JudgeFactor>,
    ) -> Result<VerdictV1> {
        let job = self.job(job_id).await?;
        // An Open verdict always carries a body, whatever its status: clearing reads the body
        // before it looks at the status, and the factors are checked for every one of them.
        let open = Some(OpenBody {
            components,
            factors,
            shown: vec![],
        });
        Ok(VerdictV1 {
            domain: VerdictV1::DOMAIN,
            chain_id: CHAIN_ID.into(),
            clearing: self.clearing.id().to_string(),
            job_id,
            job_commitment: commitment_of(&job),
            listing_id: job["listing_id"].as_u64().expect("a listing id"),
            listing_version: 1,
            appraiser: samples::appraiser(),
            status,
            privacy: VerdictPrivacy::Open,
            open,
            sealed: None,
            delivery_commitment: Some(DELIVERY_HASH),
            cert_hash: [0xce; 32],
            room_key: room_key(),
            nonce: [0x5b; 16],
            t_start: 0,
            t_end: 1,
        })
    }

    /// A relayer sends the room's verdict; the room's signature is the authority.
    pub async fn submit_verdict(&self, verdict: &VerdictV1) -> Result<ExecutionFinalResult> {
        call(
            &self.operator,
            &self.clearing,
            "submit_verdict",
            json!({
                "verdict": b64(&to_bytes(verdict)),
                "sig": sign_as_room(&verdict_signing_bytes(verdict)),
            }),
            no_deposit(),
        )
        .await
    }

    /// An appraisal all the way to its settlement: the key is released, the room reports, and
    /// clearing prices it itself. Returns the settlement answer.
    pub async fn appraise(
        &self,
        job_id: u64,
        status: VerdictStatus,
        components: Vec<u32>,
        factors: Vec<JudgeFactor>,
    ) -> Result<Value> {
        self.release_key(job_id).await?;
        let verdict = self.verdict(job_id, status, components, factors).await?;
        succeeded(self.submit_verdict(&verdict).await?)
    }

    /// The room says the good was delivered, with the hash its verdict committed to.
    pub async fn deliver(&self, job_id: u64) -> Result<ExecutionFinalResult> {
        call(
            &self.operator,
            &self.clearing,
            "submit_delivery_receipt",
            json!({ "job_id": job_id.to_string(), "delivery_hash": to_hex(&DELIVERY_HASH) }),
            no_deposit(),
        )
        .await
    }

    /// Pays the seller once the challenge window has passed, with the compliance service's
    /// approval of the payout route (AC-47). Anyone may call it, so the buyer does here, and
    /// `blocked` is a sanctions match on the route.
    pub async fn release_held(&self, job_id: u64, blocked: bool) -> Result<ExecutionFinalResult> {
        let approval = PayoutApproval {
            domain: PayoutApproval::DOMAIN,
            chain_id: CHAIN_ID.into(),
            clearing: self.clearing.id().to_string(),
            subject: self.seller.id().to_string(),
            route_hash: hash_of(&PayoutRoute::NearAccount(self.seller.id().to_string())),
            list_version: [0x11; 32],
            screening_id: [0x22; 32],
            blocked,
            expiry_height: self.height().await? + 1_000,
        };
        call(
            self.buyer(0),
            &self.clearing,
            "release_held",
            json!({
                "job_id": job_id.to_string(),
                "approval": b64(&to_bytes(&approval)),
                "sig": b64(&compliance_key()
                    .sign(&payout_approval_signing_bytes(&approval))
                    .to_bytes()),
            }),
            no_deposit(),
        )
        .await
    }

    /// Anyone may end a job nobody finished (AC-34): here, the seller.
    pub async fn refund_expired(&self, job_id: u64) -> Result<ExecutionFinalResult> {
        call(
            &self.seller,
            &self.clearing,
            "refund_expired",
            json!({ "job_id": job_id.to_string() }),
            no_deposit(),
        )
        .await
    }

    /// A nullifier credential the issuer signed for `buyer`, as a request carries it (AC-14).
    pub fn nullifier(
        &self,
        buyer: &Account,
        listing_id: u64,
        nullifier: [u8; 32],
        expiry_height: u64,
    ) -> (NullifierCredential, [u8; 64]) {
        let credential = NullifierCredential {
            domain: NullifierCredential::DOMAIN,
            chain_id: CHAIN_ID.into(),
            clearing: self.clearing.id().to_string(),
            subject: buyer.id().to_string(),
            listing_id,
            epoch: 1,
            nullifier,
            expiry_height,
        };
        let signature = issuer_key()
            .sign(&nullifier_signing_bytes(&credential))
            .to_bytes();
        (credential, signature)
    }

    /// Registers an agent key on a buyer's own account and returns the signer that holds it: a
    /// function-call key limited to `request_appraisal`, which is what an agent is given (§3.21).
    pub async fn agent_key(&self, buyer: &Account, caps: Value) -> Result<Account> {
        let secret = SecretKey::from_seed(KeyType::ED25519, buyer.id().as_str());
        let public = secret.public_key();
        buyer
            .batch(buyer.id())
            .add_key(
                public.clone(),
                AccessKey::function_call_access(self.clearing.id(), &["request_appraisal"], None),
            )
            .transact()
            .await?
            .into_result()?;
        // The contract names a key by its 32 bytes, which is what `env::signer_account_pk()` gives
        // it without the leading curve byte.
        let parsed: near_sdk::PublicKey = public.to_string().parse().expect("an ed25519 key");
        call(
            buyer,
            &self.clearing,
            "register_agent_key",
            json!({ "public_key": hex::encode(&parsed.as_bytes()[1..]), "caps": caps }),
            no_deposit(),
        )
        .await?
        .into_result()?;
        Ok(Account::from_secret_key(
            buyer.id().clone(),
            secret,
            &self.worker,
        ))
    }
}
