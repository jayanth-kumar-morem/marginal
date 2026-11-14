/**
 * The screening lexicon (SDD §3.15.2): the public reference lists baked into the measured image.
 *
 * Baked in rather than fetched, because a screen whose word list the host could change is a screen
 * the host controls (DR-9). Changing any list here changes the compose hash, so a seller who pinned
 * a measurement pinned these words too.
 *
 * M1 screens for one thing, material non-public information, and this is a demonstration list, not
 * a compliance product: it is deliberately small and English-only. Screening beyond the MNPI
 * lexicon and rules is E17 (tasks.md, "What M1 cuts").
 */

/**
 * Phrases that, on their own, mean the seller is telling us the document is not public. None of
 * these has an innocent reading in a document offered for sale.
 */
export const INSIDER_PHRASES: readonly string[] = [
  "material non-public",
  "material nonpublic",
  "inside information",
  "insider information",
  "do not distribute",
  "not for distribution",
  "strictly confidential",
  "confidential — internal only",
  "confidential - internal only",
  "under embargo",
  "embargoed until",
  "prior to the announcement",
  "before the announcement",
  "ahead of the announcement",
  "not yet announced",
  "not yet public",
  "pre-announcement",
  "board deck",
  "draft press release",
];

/**
 * Corporate events that are price-sensitive before they are announced. On their own these are
 * ordinary words — a published analysis discusses earnings — so one of these flags only together
 * with a named issuer or protocol.
 */
export const EVENT_TERMS: readonly string[] = [
  "earnings",
  "guidance",
  "merger",
  "acquisition",
  "takeover",
  "tender offer",
  "restatement",
  "profit warning",
  "clinical trial results",
  "regulatory approval",
  "token unlock",
  "treasury allocation",
  "exploit postmortem",
];

/** Issuers and protocols a demo document might be about. */
export const ISSUER_LEXICON: readonly string[] = [
  "acme corp",
  "acme corporation",
  "northwind",
  "initech",
  "umbrella health",
  "globex",
  "stark industries",
  "wayne enterprises",
  "aether labs",
  "helios protocol",
  "nimbus finance",
  "orbital dao",
];
