/**
 * The three theme choices, and the order a single button cycles them in.
 *
 * The vendored `components/ui/theme-toggle` is an inline radio group with three preview cards and
 * its own animation: it is built to sit in a settings page, and in the header it rendered above the
 * viewport and was clipped. Vendored UI is not ours to rewrite (`CLAUDE.md`), so the header uses a
 * control of our own instead, and the part worth testing lives here rather than in the `.tsx`.
 *
 * `system` is in the cycle, not just the default: a person whose machine switches at dusk should be
 * able to get back to that without clearing site data.
 */
export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/** Whether a stored or reported value is one of the three. `next-themes` can report `undefined`. */
export function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}

/**
 * The next theme in the cycle. Anything unrecognised — an empty string, a value from an older
 * build, `undefined` before the provider has mounted — starts the cycle rather than disappearing
 * off the end of it.
 */
export function nextTheme(current: string | undefined): Theme {
  if (!isTheme(current)) return THEMES[0];
  const at = THEMES.indexOf(current);
  return THEMES[(at + 1) % THEMES.length] as Theme;
}

/** What the button says it will do, for the label a screen reader reads and the tooltip. */
export function themeLabel(current: string | undefined): string {
  const now = isTheme(current) ? current : THEMES[0];
  return `Theme: ${now}. Switch to ${nextTheme(now)}.`;
}
