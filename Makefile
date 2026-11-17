# One entry point for local checks. There is no hosted CI: the pre-commit hook (.githooks/pre-commit)
# runs `check-rust` and/or `check-node` for the staged paths, and `make ci` is the full gate.
# Contracts go through cargo-near, never plain `cargo build`.
CONTRACTS := contracts/clearing contracts/keypolicy contracts/test-tokens/musdc
# Built for the sandbox tests only, never reproducibly and never deployed: the test doubles, and
# KeyPolicy with simulated rooms (`keypolicy-sim`, in its own directory so it cannot be mistaken for
# the real one).
TEST_CONTRACTS := contracts/test-mocks/mocks
NODE := . $$HOME/.nvm/nvm.sh >/dev/null 2>&1 && nvm use >/dev/null 2>&1 || true

.PHONY: hooks check check-rust check-node cov cov-rust cov-node ensure-wasm wasm-core models props wasm wasm-dev wasm-sim web e2e ci

hooks:
	git config core.hooksPath .githooks

check: check-rust check-node

# fmt, clippy for the wasm target and for host code (tests included), then every native test
# (unit, and marginal-core's integration and property tests at 256 cases) under the 100% coverage gate.
check-rust:
	cargo fmt --all -- --check
	cargo clippy --workspace --target wasm32-unknown-unknown --locked -- -D warnings
	cargo clippy -p keypolicy --features sim-attestation --target wasm32-unknown-unknown --locked -- -D warnings
	cargo clippy --workspace --all-targets --locked -- -D warnings
	cargo clippy -p keypolicy --features sim-attestation --all-targets --locked -- -D warnings
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
	cargo llvm-cov --no-report --profile cov -p keypolicy --features sim-attestation --lib --locked
	cargo llvm-cov --no-report --profile cov -p marginal-core -p marginal-core-wasm --tests --locked
	cargo llvm-cov report --profile cov --ignore-filename-regex 'tests/' --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100

# TypeScript: unit and end-to-end tests together (deploy.ts and cli.ts are exercised end to end),
# 100% of lines, branches and functions. Needs built wasm (`make wasm-dev`).
cov-node: ensure-wasm wasm-core models
	$(NODE); pnpm build && pnpm cov

# The embedder's weights and tokenizer (`knowledge@1`). They are not committed — `model.onnx` is
# 90 MB — but their SHA-256s are, in room/models/all-MiniLM-L6-v2/SHA256SUMS, which is what the room
# checks every file against before loading it and what the image's measurement covers. Fetched once
# from the model's own repository; the hashes are what make the download trustworthy.
MODEL_DIR := room/models/all-MiniLM-L6-v2
MODEL_URL := https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main
models: $(MODEL_DIR)/onnx/model.onnx

$(MODEL_DIR)/onnx/model.onnx: $(MODEL_DIR)/SHA256SUMS
	@mkdir -p $(MODEL_DIR)/onnx
	@for f in config.json special_tokens_map.json tokenizer.json tokenizer_config.json onnx/model.onnx; do \
		if [ ! -f $(MODEL_DIR)/$$f ]; then echo "== fetching $$f"; curl -sSLf -o $(MODEL_DIR)/$$f $(MODEL_URL)/$$f || exit 1; fi; \
	done
	@cd $(MODEL_DIR) && shasum -a 256 -c SHA256SUMS || { echo "model files do not match SHA256SUMS"; exit 1; }
	@touch $@

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

# Fast local build, same output paths. Sandbox only. Also builds the test doubles and keypolicy-sim.
wasm-dev: wasm-sim
	@for c in $(CONTRACTS) $(TEST_CONTRACTS); do echo "== dev build: $$c"; (cd $$c && cargo near build non-reproducible-wasm --locked) || exit 1; done

# `keypolicy-sim` on its own, which is all a `*-sim` profile needs on top of `make wasm`. It is a
# plain build, not a reproducible one, on purpose: this contract admits rooms that prove nothing, so
# there is no measurement for anyone to reproduce it against. The manifest still records its hash.
wasm-sim:
	@echo "== dev build: contracts/keypolicy (sim-attestation)"; (cd contracts/keypolicy && cargo near build non-reproducible-wasm --locked --features sim-attestation --out-dir ../../target/near/keypolicy-sim) || exit 1

# The web app's real build. It is not part of `make check` on purpose: `pnpm build` typechecks every
# package (`tsc --noEmit` for apps/web), which is what the coverage gate needs, while a Next build
# costs the better part of a minute and fetches the three Google fonts. This runs before a deploy.
web: wasm-core
	$(NODE); pnpm --filter @marginal/core-wasm --filter @marginal/sdk --filter @marginal/replay-ts build
	$(NODE); pnpm --filter @marginal/web build:next

# Needs built wasm: sandbox contract tests and the deploy end-to-end.
e2e: ensure-wasm
	cargo test --workspace --test '*' --locked
	$(NODE); pnpm -r --if-present test:e2e

# Full gate: `check` (which includes 100% coverage), the full property sweep, reproducible builds
# and the end-to-end tests.
# Needs Docker and a clean tree.
ci: check props wasm web e2e
