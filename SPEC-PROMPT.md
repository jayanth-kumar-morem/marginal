You are writing a rigorous, investor-grade product specification for **Marginal** (working name), a confidential exchange where a buyer pays only for the measured marginal value of an information good they do not already have.

## Deliverable

Rewrite and fully complete `./SPEC.md` in this directory. `SPEC.md` currently is a copy of `./spec-template.md` (a short example KYI feature spec). Replace ALL of that example content. Do not leave any KYI/onboarding/placeholder text.

Leave these files unchanged: `spec-template.md`, `MOONSHOT.md`, and everything under `moonshot-notes/`.

You may write optional working notes under a new folder such as `spec-notes/` if that helps you research, but the only required deliverable is a complete `SPEC.md`.

## Source material (read first)

1. `./MOONSHOT.md` — the full product vision and research case.
2. `./moonshot-notes/competitors.md`
3. `./moonshot-notes/judges-theses.md`
4. `./moonshot-notes/market.md`
5. `./moonshot-notes/papers.md`
6. `./spec-template.md` — use this as the **section structure and metadata format only**.

## Template structure to keep (do not renumber)

Keep the exact heading numbers and titles from `spec-template.md`. The example template skips §5 and §7; do not invent new top-level section numbers, and do not renumber to fill the gap. Keep:

- Header metadata: **Spec ID**, **Author**, **Date created**, **Status**, **Linked issues**
- ## 1. Problem
- ## 2. Goal & Non-Goals
- ## 3. Users & Scenarios
- ## 4. Proposed Solution
- ## 6. Acceptance Criteria
- ## 8. Test Plan
- ## 9. Risks & Open Questions

Metadata to use:
- **Spec ID:** **SPEC-001**
- **Author:** @jay
- **Date created:** 2026-11-11
- **Status:** `Authored`
- **Linked issues:** leave as *(added once Status = Feature)* unless you have real issue IDs (you do not).

Within each section, write at the depth a serious product specification needs. This is NOT a short ticket like the KYI example. Use subsections (e.g. ### 4.1 ...) freely inside those top-level sections. Pull in (and, where you research further, update) the architecture, mechanism, appraisers, trust/threat model, market, business model, competitive position, roadmap, and LETHE / ChainProof Guard / Rippner v0 mapping from MOONSHOT.md, recast as a product spec rather than a research memo.

## Hard constraints

- **Do NOT build any code.** No contracts, repos, apps, deployments, prototypes, tests to implement, git commits, or packaging. Research and write only.
- **Do not post, tweet, submit, purchase, or email anything.**
- **Ignore hackathon timelines and scale limits.** This spec is for the full product investors would fund, not a 3-day build. You may mention LETHE as an existing v0 / existence proof, but do not constrain the product by the hackathon deadline.
- **No invented facts or numbers.** Every market figure, performance number, competitor claim, paper result, and quote must be sourced or clearly labelled as an **estimate** with the method and inputs shown. If MOONSHOT.md or the notes already label something as an estimate, secondary source, or unverified quote, preserve that labelling. If you cannot verify a claim, say so and do not present it as fact.
- **Do extensive web research.** Search and fetch current, primary sources. Read relevant papers (arXiv abstracts/PDFs or official pages) when a design claim depends on them. Prefer primary sources over aggregators. If you cite a paper, include identifier (arXiv id, DOI, or URL) and a short statement of what it actually shows.
- Update or correct MOONSHOT.md claims if your research finds they are stale, wrong, or overstated — but only with sources, and put the corrected version in SPEC.md (do not edit MOONSHOT.md).
- Be honest about what is new vs. what already exists (TEE escrow, NDAI-style markets, Ocean, iExec, Super Protocol, Turnkey, etc.). Lead with buyer-relative / marginal-value pricing and the forget certificate, not "TEE escrow."
- Note the name clash: "Lethe protocol" is already taken; Marginal is a working name and may need to change.
- Do not treat judge quotes marked secondary in the notes as if they were verified primary quotes.

## What "complete" means for each section

**1. Problem.** The economic and technical problem (Arrow's information paradox; you cannot price information without revealing it; existing confidential-data markets failed to find PMF; AI labs, funds, and expert networks already pay for knowledge but cannot inspect safely). Who hurts, why now, why existing tools fail. Sourced.

**2. Goal & Non-Goals.** Precise product goals for the full investor-grade exchange. Explicit non-goals (what Marginal is not: not a generic TEE cloud, not a generic data marketplace, not an insurance company first, etc.).

**3. Users & Scenarios.** Concrete users (AI labs, funds / alternative-data buyers, expert-network sellers, model/eval-set sellers, later: individuals, insurers) and numbered scenarios in the "As a …, when I …, I …, so that …" style, covering successful purchase, no-deal + forget certificate, cross-chain settlement, appraisal against the buyer's own notes or private eval, adversarial / fake-buyer probing, and refunds.

**4. Proposed Solution.** The heart of the spec. Include: product in one paragraph; system layers and NEAR primitives; appraisers by asset class; mechanism (what the contract enforces vs. what the AI may do — AI can only lower a price); trust model; threat model; settlement / Intents; forget-certificate behavior; how LETHE, ChainProof Guard, and Rippner map in as v0 / components; roadmap from v0 → v1 → full product without hackathon timeboxes. Be specific enough that an engineer could later implement from this, but do not write the code.

**6. Acceptance Criteria.** Testable, numbered criteria for the full product (and clearly labelled staged criteria if v1 vs later). These must be objectively checkable, not slogans.

**8. Test Plan.** Unit / integration / adversarial / economic / staging-or-testnet validation. Include replayability of settlements from public chain data, attestation checks, no-deal destruction + forget certificate, and probes for appraisal leakage. Still: describe the plan only; do not implement tests.

**9. Risks & Open Questions.** Hardware attacks on enclaves, appraisal-score leakage / fake buyers reconstructing a good, regulation (insider information when selling to funds), demand risk (Ocean / iExec history), year-5 revenue sensitivity, name collision, open research problems. Each risk should have a mitigation or a clearly marked open question.

Where useful, add a short **Sources** subsection at the end of §9 (still under §9, do not add a new top-level section number) listing the most important citations used in the spec.

## Quality bar

Write in clear, direct prose. No hype, no hedges that hide uncertainty — state uncertainty plainly. Keep it long enough to be complete and short enough to be usable; completeness beats brevity when they conflict. When you finish, do a self-check that every template section is present and non-empty, that no KYI example text remains, and that every number is sourced or labelled as an estimate.

Then stop. Do not start building the product.
