//! Sandbox tests for `musdc` (E1.2): metadata, faucet-only mint, NEP-145 storage, transfers.
//! Needs the built wasm: `make wasm` (or `cargo near build non-reproducible-wasm` in this crate).
use near_workspaces::{types::NearToken, Account, Contract};
use serde_json::json;

const ONE_USDC: u128 = 1_000_000;

fn wasm() -> Vec<u8> {
    let dir = std::env::var("CARGO_TARGET_DIR").unwrap_or_else(|_| format!("{}/../../../target", env!("CARGO_MANIFEST_DIR")));
    std::fs::read(format!("{dir}/near/musdc/musdc.wasm"))
        .expect("build first: make wasm")
}

struct Env {
    token: Contract,
    faucet: Account,
    alice: Account,
    bob: Account,
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let mk = |name: &'static str| {
        let root = root.clone();
        async move {
            root.create_subaccount(name).initial_balance(NearToken::from_near(20)).transact().await.unwrap().into_result().unwrap()
        }
    };
    let faucet = mk("faucet").await;
    let alice = mk("alice").await;
    let bob = mk("bob").await;
    let token_acc = mk("musdc").await;
    let token = token_acc.deploy(&wasm()).await?.into_result()?;
    token.call("new").args_json(json!({"faucet": faucet.id()})).transact().await?.into_result()?;
    Ok(Env { token, faucet, alice, bob })
}

async fn balance(e: &Env, who: &Account) -> anyhow::Result<u128> {
    let v: String = e.token.view("ft_balance_of").args_json(json!({"account_id": who.id()})).await?.json()?;
    Ok(v.parse()?)
}

#[tokio::test]
async fn metadata_has_six_decimals() -> anyhow::Result<()> {
    let e = setup().await?;
    let m: serde_json::Value = e.token.view("ft_metadata").await?.json()?;
    assert_eq!(m["decimals"], 6);
    assert_eq!(m["symbol"], "musdc");
    assert_eq!(m["spec"], "ft-1.0.0");
    Ok(())
}

#[tokio::test]
async fn only_the_faucet_can_mint() -> anyhow::Result<()> {
    let e = setup().await?;
    let amt = (100 * ONE_USDC).to_string();

    let denied = e.alice.call(e.token.id(), "mint").args_json(json!({"account_id": e.alice.id(), "amount": amt})).transact().await?;
    assert!(denied.is_failure(), "non-faucet mint must fail");
    assert!(format!("{:?}", denied.into_result().unwrap_err()).contains("only the faucet can mint"));
    assert_eq!(balance(&e, &e.alice).await?, 0);

    e.faucet.call(e.token.id(), "mint").args_json(json!({"account_id": e.alice.id(), "amount": amt})).transact().await?.into_result()?;
    assert_eq!(balance(&e, &e.alice).await?, 100 * ONE_USDC);
    let supply: String = e.token.view("ft_total_supply").await?.json()?;
    assert_eq!(supply, amt);

    let zero = e.faucet.call(e.token.id(), "mint").args_json(json!({"account_id": e.alice.id(), "amount": "0"})).transact().await?;
    assert!(zero.is_failure(), "zero mint must fail");
    Ok(())
}

#[tokio::test]
async fn storage_registration_gates_transfers() -> anyhow::Result<()> {
    let e = setup().await?;
    e.faucet.call(e.token.id(), "mint").args_json(json!({"account_id": e.alice.id(), "amount": (50 * ONE_USDC).to_string()})).transact().await?.into_result()?;

    // Bounds are exposed and bob is unregistered.
    let bounds: serde_json::Value = e.token.view("storage_balance_bounds").await?.json()?;
    let min = bounds["min"].as_str().unwrap().to_string();
    assert!(min.parse::<u128>()? > 0);
    let none: Option<serde_json::Value> = e.token.view("storage_balance_of").args_json(json!({"account_id": e.bob.id()})).await?.json()?;
    assert!(none.is_none());

    // Transfer to an unregistered receiver fails and moves nothing.
    let fail = e.alice.call(e.token.id(), "ft_transfer").args_json(json!({"receiver_id": e.bob.id(), "amount": "1000000"})).deposit(NearToken::from_yoctonear(1)).transact().await?;
    assert!(fail.is_failure(), "transfer to unregistered account must fail");
    assert_eq!(balance(&e, &e.alice).await?, 50 * ONE_USDC);

    // Register bob with a storage deposit.
    let dep = NearToken::from_yoctonear(min.parse()?);
    e.bob.call(e.token.id(), "storage_deposit").args_json(json!({})).deposit(dep).transact().await?.into_result()?;
    let sb: Option<serde_json::Value> = e.token.view("storage_balance_of").args_json(json!({"account_id": e.bob.id()})).await?.json()?;
    assert!(sb.is_some());

    // Transfers need exactly 1 yoctoNEAR.
    let no_yocto = e.alice.call(e.token.id(), "ft_transfer").args_json(json!({"receiver_id": e.bob.id(), "amount": "1000000"})).transact().await?;
    assert!(no_yocto.is_failure(), "ft_transfer without 1 yocto must fail");

    e.alice.call(e.token.id(), "ft_transfer").args_json(json!({"receiver_id": e.bob.id(), "amount": (20 * ONE_USDC).to_string()})).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    assert_eq!(balance(&e, &e.alice).await?, 30 * ONE_USDC);
    assert_eq!(balance(&e, &e.bob).await?, 20 * ONE_USDC);

    // Overdraft fails.
    let over = e.alice.call(e.token.id(), "ft_transfer").args_json(json!({"receiver_id": e.bob.id(), "amount": (31 * ONE_USDC).to_string()})).deposit(NearToken::from_yoctonear(1)).transact().await?;
    assert!(over.is_failure(), "overdraft must fail");
    assert_eq!(balance(&e, &e.alice).await?, 30 * ONE_USDC);
    Ok(())
}

#[tokio::test]
async fn mint_registers_new_receivers() -> anyhow::Result<()> {
    let e = setup().await?;
    e.faucet.call(e.token.id(), "mint").args_json(json!({"account_id": e.bob.id(), "amount": ONE_USDC.to_string()})).transact().await?.into_result()?;
    let sb: Option<serde_json::Value> = e.token.view("storage_balance_of").args_json(json!({"account_id": e.bob.id()})).await?.json()?;
    assert!(sb.is_some(), "minting to a new account registers it");
    Ok(())
}
