**Spec ID:** **SPEC-001**

**Author:** @jay

**Date created:**   2026-05-17

**Status:** `Authored`

**Linked issues:**  *(added once Status = Feature)*

## 1. Problem

Issuers onboarding through KYI cannot tell, mid-flow, which verification steps remain. They abandon the flow or contact support. Support handles \~6 such tickets/week, and onboarding drop-off after step 2 is \~30%.

## 2. Goal & Non-Goals

* **Goal:** Show issuers a persistent, accurate progress indicator across the KYI onboarding flow so they always know what is done and what remains.
* **Non-Goals:**
  * Does NOT change the verification steps themselves or their order.
  * Does NOT add new KYI data requirements.
  * Does NOT cover the post-approval issuer dashboard.

## 3. Users & Scenarios

* **Who:** Issuer admins completing KYI onboarding.
* Scenarios:
  1. As an issuer admin, when I land on step 3 of 5, I see steps 1–2 marked complete and 4–5 pending, so I know I am over halfway.
  2. As an issuer admin, when I leave and return the next day, the indicator reflects my real saved progress so I do not redo completed steps.
  3. As an issuer admin, when a step fails verification, the indicator marks that step as needs-attention so I act on it rather than abandoning.

## 4. Proposed Solution

Add a horizontal step indicator component to the KYI onboarding layout, rendered above the active step form. The component reads onboarding state from the existing `kyi_application` record and derives per-step status (`complete` / `current` / `pending` / `needs_attention`). No new persistence — status is derived from fields already saved per step. Component is presentational; it receives a `steps[]` prop from the onboarding layout container.

Reference design: *Figma link — Onboarding / KYI Progress Indicator (replace with real link).*

## 6. Acceptance Criteria

1. The indicator renders on every KYI onboarding step and shows all five steps.
2. Steps the user has completed render as `complete`; the active step as `current`; later steps as `pending`.
3. A step that failed verification renders as `needs_attention` and is visually distinct from `pending`.
4. On leaving and returning to onboarding, the indicator reflects the saved application state, not a reset state.
5. The indicator is non-interactive (display only) — clicking a step does not navigate.

## 8. Test Plan

* **Unit:** Status-derivation function covered for all four status outcomes and for a malformed record.
* **Integration:** Component renders correct states for a representative `kyi_application` fixture at steps 1, 3, and 5, including one `needs_attention` case.
* **Staging validation:** Walk the full 5-step KYI onboarding flow on staging; leave and return mid-flow; confirm the indicator matches saved state before promotion to main.

## 9. Risks & Open Questions

* Risk: if step state is partially saved (a step half-complete), derivation may show `pending` where `needs_attention` is truer. Open question: do we need a fifth `in_progress` state? Accepted for v1 as `pending`; revisit if support tickets continue.
