# One entry point for local checks. There is no hosted CI: the pre-commit hook (.githooks/pre-commit)
# runs `check-rust` and/or `check-node` for the staged paths, and `make ci` is the full gate.
# Contracts go through cargo-near, never plain `cargo build`.
CONTRACTS := contracts/clearing contracts/keypolicy contracts/test-tokens/musdc
NODE := . $$HOME/.nvm/nvm.sh >/dev/null 2>&1 && nvm use >/dev/null 2>&1 || true

.PHONY: hooks check check-rust check-node cov cov-rust cov-node ensure-wasm wasm-core props wasm wasm-dev e2e ci

hooks:
	git config core.hooksPath .githooks

check: check-rust check-node

# fmt, clippy for the wasm target and for host code (tests included), then every native test
# (unit, and marginal-core's integration and property tests at 256 cases) under the 100% coverage gate.
check-rust:
	cargo fmt --all -- --check
	cargo clippy --workspace --target wasm32-unknown-unknown --locked -- -D warnings
	cargo clippy --workspace --all-targets --locked -- -D warnings
	$(MAKE) cov-rust

# eslint, then (tsc and) every unit and end-to-end test under the 100% coverage gate.
check-node:
	$(NODE); pnpm install --frozen-lockfile --silent && pnpm lint
	$(MAKE) cov-node

# Coverage is required to be 100%. Rust: lines, functions and regions, from the unit tests and
# marginal-core's integration tests (the sandbox tests run on wasm, which cannot be measured; the
# unit tests cover the same code natively). Uses the `cov` profile (see Cargo.toml): in debug builds
# near-sdk's `require!` takes its `assert!` branch, which leaves the real check permanently unexecuted.
# The `cargo clean -p` drops stale instrumented binaries of our own crates (they would be merged into
# the report), and keeps the compiled dependencies. Needs cargo-llvm-cov (`cargo install cargo-llvm-cov`).
cov-rust:
	cargo llvm-cov clean --workspace
	cargo clean -p marginal-core -p marginal-core-wasm -p clearing -p keypolicy -p musdc --profile cov --target-dir target/llvm-cov-target
	cargo llvm-cov --no-report --profile cov --workspace --exclude marginal-core --exclude marginal-core-wasm --lib --locked
	cargo llvm-cov --no-report --profile cov -p marginal-core -p marginal-core-wasm --tests --locked
	cargo llvm-cov report --profile cov --ignore-filename-regex 'tests/' --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100

# TypeScript: unit and end-to-end tests together (deploy.ts and cli.ts are exercised end to end),
# 100% of lines, branches and functions. Needs built wasm (`make wasm-dev`).
cov-node: ensure-wasm wasm-core
	$(NODE); pnpm build && pnpm cov

# marginal-core as wasm, for the room and replay-ts (`@marginal/core-wasm` loads it). Rebuilt whenever
# a Rust source or manifest changes. Needs no extra tools: it is plain `cargo build`.
CORE_WASM := crates/marginal-core-wasm/core.wasm
wasm-core: $(CORE_WASM)

$(CORE_WASM): $(shell find crates -name '*.rs' -o -name Cargo.toml) Cargo.toml Cargo.lock
	cargo build -p marginal-core-wasm --target wasm32-unknown-unknown --release --locked
	cp target/wasm32-unknown-unknown/release/marginal_core_wasm.wasm $@

# The end-to-end tests deploy real wasm to a local node. Rebuild it (fast, non-reproducible) whenever
# a Rust source or manifest is newer than the last build, so they never run against stale contracts.
ensure-wasm: target/near/.dev-stamp

target/near/.dev-stamp: $(shell find contracts crates \( -name '*.rs' -o -name Cargo.toml \)) Cargo.toml Cargo.lock
	$(MAKE) wasm-dev
	touch $@

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
e2e: ensure-wasm
	cargo test --workspace --test '*' --locked
	$(NODE); pnpm -r --if-present test:e2e

# Full gate: `check` (which includes 100% coverage), the full property sweep, reproducible builds
# and the end-to-end tests.
# Needs Docker and a clean tree.
ci: check props wasm e2e
