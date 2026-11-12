# One entry point for local checks. There is no hosted CI: the pre-commit hook (.githooks/pre-commit)
# runs `check-rust` and/or `check-node` for the staged paths, and `make ci` is the full gate.
# Contracts go through cargo-near, never plain `cargo build`.
CONTRACTS := contracts/clearing contracts/keypolicy contracts/test-tokens/musdc
NODE := . $$HOME/.nvm/nvm.sh >/dev/null 2>&1 && nvm use >/dev/null 2>&1 || true

.PHONY: hooks check check-rust check-node props wasm wasm-dev e2e ci

hooks:
	git config core.hooksPath .githooks

check: check-rust check-node

# fmt, clippy for the wasm target and for host code (tests included), unit tests, and
# marginal-core's integration and property tests (default 256 cases per property).
check-rust:
	cargo fmt --all -- --check
	cargo clippy --workspace --target wasm32-unknown-unknown --locked -- -D warnings
	cargo clippy --workspace --all-targets --locked -- -D warnings
	cargo test --workspace --lib --locked
	cargo test -p marginal-core --tests --locked

check-node:
	$(NODE); pnpm install --frozen-lockfile --silent && pnpm lint && pnpm typecheck && pnpm test

# The full property sweep: 10^6 cases per property (SPEC AC-2), release mode, about a minute.
props:
	PROPTEST_CASES=1000000 cargo test -p marginal-core --release --tests --locked

# Reproducible (docker) build of every contract into target/near/<crate>/<crate>.wasm.
# Needs Docker and a clean git tree with a committed Cargo.lock. Required before any testnet deploy.
wasm:
	@for c in $(CONTRACTS); do echo "== reproducible build: $$c"; (cd $$c && cargo near build reproducible-wasm) || exit 1; done

# Fast local build, same output paths. Sandbox only.
wasm-dev:
	@for c in $(CONTRACTS); do echo "== dev build: $$c"; (cd $$c && cargo near build non-reproducible-wasm --locked) || exit 1; done

# Needs built wasm: sandbox contract tests and the deploy end-to-end.
e2e:
	cargo test --workspace --test '*' --locked
	$(NODE); pnpm -r --if-present test:e2e

# Full gate: everything above plus the full property sweep and reproducible builds.
# Needs Docker and a clean tree.
ci: check props wasm e2e
