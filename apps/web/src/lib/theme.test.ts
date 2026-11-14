import test from "node:test";
import assert from "node:assert/strict";

import { THEMES, isTheme, nextTheme, themeLabel } from "./theme";

test("the three themes cycle, and anything unrecognised starts the cycle", () => {
  assert.deepEqual([...THEMES], ["light", "dark", "system"]);

  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
  assert.equal(nextTheme("system"), "light", "the cycle closes");

  // `next-themes` reports `undefined` until it has mounted, and a stored value can outlive a build.
  for (const odd of [undefined, "", "sepia", "LIGHT"]) {
    assert.equal(nextTheme(odd), "light", JSON.stringify(odd));
  }

  assert.equal(isTheme("dark"), true);
  assert.equal(isTheme(undefined), false);
  assert.equal(isTheme("sepia"), false);
});

test("the label says where you are and what the button does", () => {
  assert.equal(themeLabel("dark"), "Theme: dark. Switch to system.");
  assert.equal(themeLabel("system"), "Theme: system. Switch to light.");
  assert.equal(themeLabel(undefined), "Theme: light. Switch to dark.");
});
