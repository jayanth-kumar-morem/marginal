/**
 * What was simulated, read off the chain rather than written by hand (DRC-12, SDD §6.3 rule 1:
 * "Any simulated element sets a bit in `SettlementRecord.simulated_flags`. The UI shows a banner").
 *
 * The bits are `marginal_core::types`' `SIM_*` constants. Nothing here decides what is simulated —
 * the contracts do, when they record it — and this is the one place that turns those bits into
 * words, so the banner on a page, the label on a settlement and E15.3's README table all say the
 * same thing.
 */

/** `SIM_ATTESTATION`: the room registered under a simulated attestation, not a real TDX quote. */
export const SIM_ATTESTATION = 1;
/** `SIM_JUDGE`: a judge's factor had no NEAR AI receipt behind it. */
export const SIM_JUDGE = 2;
/** `SIM_SETTLEMENT`: the settlement asset is a test token, not real value. */
export const SIM_SETTLEMENT = 4;

export interface SimulatedElement {
  readonly bit: number;
  readonly label: string;
  /** What it means for what the viewer is looking at. */
  readonly detail: string;
}

const ELEMENTS: readonly SimulatedElement[] = [
  {
    bit: SIM_ATTESTATION,
    label: "Simulated attestation",
    detail: "the room's quote was not verified on-chain, so its measurement proves nothing",
  },
  {
    bit: SIM_JUDGE,
    label: "Simulated judge",
    detail: "a judge ran without a signed NEAR AI receipt, so its factor was pinned to the floor",
  },
  {
    bit: SIM_SETTLEMENT,
    label: "Simulated settlement",
    detail: "the amounts moved a test token, not real value",
  },
];

/** Which elements a `simulated_flags` byte names, in bit order. */
export function simulatedElements(flags: number): readonly SimulatedElement[] {
  return ELEMENTS.filter((element) => (flags & element.bit) !== 0);
}

/** One line for a settlement's flags, or null when every element was real. */
export function simulatedSummary(flags: number): string | null {
  const names = simulatedElements(flags).map((element) => element.label.toLowerCase());
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] as string}`;
  return `This record was produced with a ${list}.`;
}

/**
 * The banner the shell shows on every page. A demo profile always carries one, because something in
 * it is simulated even before a settlement exists; a production profile carries none.
 */
export function profileBanner(config: {
  profile: string;
  network: string;
  simulatedProfile: boolean;
}): string | null {
  if (!config.simulatedProfile) return null;
  return (
    `This is the ${config.profile} profile on ${config.network}. Simulated elements are flagged ` +
    `on-chain and shown on the record they produced; amounts are a test token.`
  );
}
