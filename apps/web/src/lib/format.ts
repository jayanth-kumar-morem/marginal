/**
 * How numbers and identifiers are written on every page (E13.1).
 *
 * All of it is integer arithmetic on strings, because the chain's amounts are `u128` decimal strings
 * and JavaScript's `number` cannot hold them. Nothing here rounds money: `amount` splits the string
 * at the decimal point, so what is shown is exactly what is stored.
 */

/** `musdc`, and every settlement asset in M1, has six decimals. */
export const TOKEN_DECIMALS = 6;
/** One whole bit, in the millibits leakage is accounted in (`marginal_core::leakage`). */
export const MBITS_PER_BIT = 1_000;
/** Basis points in a whole. */
export const BPS = 10_000;

/**
 * A token amount from a view (a decimal string of base units) as a human figure, with the trailing
 * zeros of the fraction trimmed but never a significant digit dropped.
 */
export function amount(base: string, decimals = TOKEN_DECIMALS): string {
  const digits = base.replace(/^0+(?=\d)/, "").padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === "" ? grouped : `${grouped}.${fraction}`;
}

/** An amount with its symbol, which is what a price or a refund is shown as. */
export function tokens(base: string, symbol = "mUSDC", decimals = TOKEN_DECIMALS): string {
  return `${amount(base, decimals)} ${symbol}`;
}

/** Yocto-NEAR as NEAR, for deposits and fees. */
export function near(yocto: string): string {
  return `${amount(yocto, 24)} NEAR`;
}

/** Basis points as a percentage: 8,250 → "82.5%". */
export function percent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction === "" ? `${whole}%` : `${whole}.${fraction}%`;
}

/** Millibits as bits: 1,000 → "1 bit", 1,500 → "1.5 bits". */
export function bits(mbits: number): string {
  const value = amount(String(mbits), 3);
  return `${value} ${mbits === MBITS_PER_BIT ? "bit" : "bits"}`;
}

/** A hash or key, elided in the middle so both ends stay checkable by eye. */
export function short(hex: string, keep = 6): string {
  return hex.length <= keep * 2 + 1 ? hex : `${hex.slice(0, keep)}…${hex.slice(-keep)}`;
}

/** An account id, elided only if it is long enough to need it. */
export function account(id: string, max = 24): string {
  if (id.length <= max) return id;
  // Split at the first dot by index rather than by `split`, so there is no "what if there is no
  // first element" case to handle that cannot happen.
  const dot = id.indexOf(".");
  const name = dot === -1 ? id : id.slice(0, dot);
  const suffix = dot === -1 ? "" : id.slice(dot);
  return `${short(name, 6)}${suffix}`;
}

/** A block height, grouped. */
export function height(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * How much of a leakage budget is gone, as a percentage of the whole, for the meter on a listing.
 * Reserved bits count as spent: they are committed to jobs that have not settled yet.
 */
export function leakageUsedPercent(leakage: {
  budget_mbits: number;
  reserved_mbits: number;
  spent_mbits: number;
}): number {
  if (leakage.budget_mbits === 0) return 100;
  const used = leakage.spent_mbits + leakage.reserved_mbits;
  return Math.min(100, Math.round((used / leakage.budget_mbits) * 100));
}

/** Seconds since the epoch as a short UTC stamp. */
export function when(secs: number): string {
  return new Date(secs * 1_000).toISOString().replace("T", " ").slice(0, 16) + "Z";
}
