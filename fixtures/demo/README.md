# Demo fixtures

The corpus the demo surfaces run on (E14.2, SDD §5.6). Everything here is **synthetic and written
for this repository**, with one deliberate exception: the OFAC address in `ofac-address.json` is a
real listed address, because a sanctions screen that blocks an invented address demonstrates
nothing. Every issuer, fund, instrument, person and number in the memos and the dataset is invented.

LETHE's own demo corpus is not in this repository, so these documents were authored here rather than
ported; what was carried over from LETHE is the measurement, not the text (`novelty.ts`, E8.6).

| File | What, and which D | Synthetic? | What not to mistake it for |
| --- | --- | --- | --- |
| `memo.md` | **D1** The good: a 900-word credit memo on the fictional Brackwater Terminals plc 2029 senior secured notes | Entirely invented | Not research on a real issuer. "Brackwater Terminals plc", "Halvard Partners" and every figure are made up, and nothing in it is anyone's non-public information |
| `notes-fund-a.md` | **D1** Buyer A's own context: a generalist fund with no coverage of the sector, so the memo is almost all new to it | Entirely invented | Not a real fund's holdings |
| `notes-fund-b.md` | **D1** Buyer B's own context: a specialist that has already done most of this work, so the memo is worth little to it | Entirely invented | Not a real fund's holdings |
| `memo-injected.md` | **D6** every byte of `memo.md`, plus an appendix carrying a prompt injection that tells the appraisal judge to award full marks | Entirely invented | Not an attack on any real system; it exists to be clamped |
| `memo-mnpi.md` | **D8** A short memo written so that `screening@1` flags it as likely MNPI | Entirely invented | **Not** material non-public information. "Northwind Industrial" does not exist, there is no board, no transaction and no earnings release; the text is a lexicon exercise |
| `ofac-address.json` | **D8** One **real** OFAC-listed digital-currency address, plus an unlistable control | No: the address is real | Not an accusation and not a seizure. A match blocks a payout and leaves the money claimable (SDD §3.20) |
| `dataset-seller.jsonl` | **D9** The seller's rows for `dataset-lite@0`, as `{text, label}` per line | Entirely invented | Not a published dataset; see the licence note below |
| `dataset-buyer.json` | **D9** The buyer's own `{train, eval}` split for the same appraiser | Entirely invented | As above |
| `cases.json` | The inputs of each case (good, context, need, ask, budget) and the figures measured from them | — | The `measured` blocks are a record of one dated run, not a contract. Only D1's outcome is enforced by a test |

## Licence

Every file in this directory except `ofac-address.json` was written for this repository: there is no
third-party text in any of them and no dataset was copied from anywhere, so whatever licence this
repository carries is the only one that applies (there is no `LICENSE` file at the root yet).

**D9 is synthetic for exactly that reason.** No permissively licensed public dataset was fetched for
it, because the licence of a downloaded corpus could not be established here with certainty, and a
fixture whose licence is a guess is worse than one that is invented. If D9 is ever swapped for a
real corpus, its licence and source belong in this table before the rows land.

The OFAC list is a US Treasury publication and is **not** redistributed here: `ofac-address.json`
records one address and where it came from, and `services/compliance` fetches the list itself at
run time.

## One sentence per line

The memos and the notes are written with **one sentence per line and no hard wrapping**. The room's
claim splitter breaks on a line break as well as on terminal punctuation (`novelty.ts`), so a
wrapped sentence would be measured as two half-claims. Keep that shape when editing them.

## D1, measured

`knowledge@1` with the embedder from `room/models/all-MiniLM-L6-v2`, then marginal-core's own
`measured_index`, `valuation` and `apply_rule`. One listing (ask 400 mUSDC under R1), one budget
(1,000 mUSDC), one need, two buyers, no judges — so `L` is a whole and `m` is the deterministic
ceiling. Measured on 2026-11-14.

| | claims | context claims | `N_b` | components | `m` | valuation | R1 outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Fund A** | 45 | 32 | 9,735 bps | `[9500, 10000]` | 9,500 | 950 mUSDC | **Deal at 400 mUSDC** |
| **Fund B** | 45 | 43 | 1,341 bps | `[1500, 10000]` | 1,500 | 150 mUSDC | **No deal** |

The outcome turns at `m = 4,000` (the ask is 40% of the budget), which after 21-level quantisation
means a novelty of 3,750 bps. Fund A is 2.6 times above that line and Fund B 2.8 times below it, so
the demo does not depend on the last basis point. Fund B's file deliberately has gaps — the
indexation mechanics, the sell-side models, the restricted payment basket, the barge-terminal risk
and the execution detail — which is why its novelty is 1,341 bps rather than near zero: a fund that
has done most of the work, not a copy of the memo.

`room/src/appraisers/knowledge/corpus.test.ts` enforces this: it runs the real appraiser over these
three files, prices the result through marginal-core, and asserts Deal for A, No deal for B, and
both margins. It costs about nine seconds of `make check`.

## D6, measured

`memo-injected.md` differs from `memo.md` by one appended appendix and nothing else (`diff` is that
one block). Its five injected sentences are novel to both buyers, so the measured ceiling moves a
little, and that is the whole of the effect the injection has:

| | `N_b` | components | `m` | valuation | R1 outcome |
| --- | --- | --- | --- | --- | --- |
| **Fund A** | 9,750 bps | `[10000, 10000]` | 10,000 | 1,000 mUSDC | Deal at 400 mUSDC |
| **Fund B** | 1,825 bps | `[2000, 10000]` | 2,000 | 200 mUSDC | No deal |

Then marginal-core was asked what a judge could do to each of those ceilings:

| judge factors | Fund A: `m` → price (D = 10,000) | Fund B: `m` → price (D = 2,000) |
| --- | --- | --- |
| none | 10,000 → 400 mUSDC | 2,000 → no deal |
| `[10000]` — the injection obeyed | 10,000 → 400 mUSDC | 2,000 → no deal |
| `[20000]` — over a whole | 10,000 → 400 mUSDC | 2,000 → no deal |
| `[5000]` | 5,000 → 400 mUSDC | 1,000 → no deal |
| `[0]` — a judge that failed to parse | 0 → no deal | 0 → no deal |

A factor can only take value off (`judgement_factor` is a minimum, AC-41), so a judge that believes
the injection buys the seller nothing: `m` never exceeds the deterministic ceiling `D`, the R1 price
to Fund A is the ask however flattering the factor, and Fund B still gets no deal because the
ceiling, not the judge, is what caps the valuation at 200 mUSDC. Nothing enforces this table; it is
`marginal-core`'s own arithmetic, and the clamp itself is covered by the AC-2 and AC-41 property
tests (`make props`).

Fund A's component lands on a quantisation boundary here: 9,750 bps is exactly half a step, so it
rounds up to the full 10,000. A small edit to the corpus can move it back to 9,500, which changes
none of the outcomes above.

## D8, measured

`screen(memo-mnpi.md)` returns `Flag { reason: 1 }` (`FLAG_MNPI`), and it fires on **both** of
`screening@1`'s routes rather than by accident:

- nine insider phrases, each of which says on its own that the document is not public:
  `material non-public`, `strictly confidential`, `embargoed until`, `before the announcement`,
  `ahead of the announcement`, `not yet announced`, `pre-announcement`, `board deck`,
  `draft press release`;
- the issuer `northwind` from the lexicon together with the event terms `earnings`, `guidance`,
  `merger` and `acquisition`.

The controls matter as much: `memo.md`, `memo-injected.md`, `notes-fund-a.md` and `notes-fund-b.md`
all return `Pass`. `memo.md` carries the event term `earnings` and `notes-fund-b.md` carries
`guidance`, with no lexicon issuer anywhere in them — so the pass shows the issuer-and-event rule
working, not merely the absence of the words. Nothing enforces these figures.

**The sanctions address.** `3K35dyL85fR9ht7UgzPfd1gLRRXQtNTqE3` (XBT) is on OFAC's SDN list under
entity 37070, `BLENDER.IO`, programme `CYBER2`. Taken from Treasury's own `sdn.csv` on **2026-11-14**
(the file published 2026-11-12; `https://www.treasury.gov/ofac/downloads/sdn.csv`, which redirects to
a signed S3 URL, 5,834,622 bytes, SHA-256
`850ef744932d60f960045c9a4cd37ebf6237f8c32c0b163801e14fbcba6d9ce3`). Checked by running
`services/compliance/src/sdn.ts`'s own `parseSdn` over that file: 520 digital-currency addresses, a
`version` equal to the hash above, `isListed` true for the address and false for the control. The
list is refetched at run time, so a later download will have a different version hash.

## D9, measured

`dataset-lite@0` over `dataset-seller.jsonl` (24 rows) against `dataset-buyer.json` (22 train, 18
eval rows, labels `liquidity`, `covenant`, `refinancing`), with a job commitment of the bytes 1…32:

| overlap | baseline accuracy | augmented | 10th-percentile lift | components | `m` (δ\* = 500 bps) |
| --- | --- | --- | --- | --- | --- |
| 0 bps | 6,111 bps | 9,444 bps | **2,222 bps** | `[2000, 0]` | 10,000 |

The buyer trains on only two `refinancing` rows but evaluates on six, and the seller's rows are
mostly `refinancing` — so the lift is real and measurable rather than noise, which is the point of
the fixture. Nothing enforces these figures.
