# One entry point for local work and CI. Contracts go through cargo-near, never plain `cargo build`.
CONTRACTS := contracts/clearing contracts/keypolicy contracts/test-tokens/musdc
NODE_ENV_SETUP := . $$HOME/.nvm/nvm.sh >/dev/null 2>&1 && nvm use >/dev/null 2>&1 || true

.PHONY: build test lint wasm wasm-dev e2e ci

# Reproducible (docker) build of every contract into target/near/<crate>/<crate>.wasm.
# Needs Docker and a clean git tree with a committed Cargo.lock.
wasm:
	@for c in $(CONTRACTS); do echo "== reproducible build: $$c"; (cd $$c && cargo near build reproducible-wasm) || exit 1; done

# Fast local build, same output paths. Not for deployment to testnet or mainnet.
wasm-dev:
	@for c in $(CONTRACTS); do echo "== dev build: $$c"; (cd $$c && cargo near build non-reproducible-wasm --locked) || exit 1; done

lint:
	cargo fmt --all -- --check
	cargo clippy --workspace --target wasm32-unknown-unknown --locked -- -D warnings
	cargo clippy --workspace --all-targets --locked -- -D warnings
	$(NODE_ENV_SETUP); pnpm lint

build:
	cargo check --workspace --target wasm32-unknown-unknown --locked
	$(NODE_ENV_SETUP); pnpm build && pnpm typecheck

test:
	cargo test --workspace --lib --locked
	$(NODE_ENV_SETUP); pnpm test

# Needs built wasm (make wasm or make wasm-dev): sandbox contract tests and the deploy end-to-end.
e2e:
	cargo test -p musdc --test sandbox --locked
	$(NODE_ENV_SETUP); pnpm --filter @marginal/scripts test:e2e

ci: lint build test wasm e2e
