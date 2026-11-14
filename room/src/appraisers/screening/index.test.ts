import test from "node:test";
import assert from "node:assert/strict";

import { FLAG_MNPI, screen } from "./index.js";
import { EVENT_TERMS, INSIDER_PHRASES, ISSUER_LEXICON } from "./lexicon.js";

test("a document that says it is not public is flagged on its own", () => {
  for (const phrase of INSIDER_PHRASES) {
    const screening = screen(`Notes.\n${phrase} — see attached.`);
    assert.deepEqual(screening.result, { Flag: { reason: FLAG_MNPI } }, phrase);
    assert.ok(screening.hits.includes(phrase), phrase);
  }
  assert.equal(FLAG_MNPI, 1, "M1 has one reason code");
});

test("an event term flags only together with a named issuer", () => {
  assert.equal(screen("Our view on earnings season across the sector.").result, "Pass");
  assert.equal(screen("A profile of Acme Corp and its history.").result, "Pass");
  assert.deepEqual(screen("Acme Corp earnings will miss.").result, { Flag: { reason: FLAG_MNPI } });
  // Both halves are reported, so a reviewer can see why it fired.
  const screening = screen("Helios Protocol token unlock schedule, internal.");
  assert.ok(screening.hits.includes("token unlock"));
  assert.ok(screening.hits.includes("helios protocol"));
});

test("case and line breaks inside a phrase do not hide it", () => {
  assert.deepEqual(
    screen("MATERIAL NON-PUBLIC information follows").result,
    { Flag: { reason: FLAG_MNPI } },
  );
  assert.deepEqual(screen("inside\n  information").result, { Flag: { reason: FLAG_MNPI } });
  assert.deepEqual(screen("Inside   Information").result, { Flag: { reason: FLAG_MNPI } });
});

test("an ordinary published document passes, and a pass is not a clearance", () => {
  const screening = screen(
    "Weekly commentary. Rates are steady and the index closed flat. No positions disclosed.",
  );
  assert.equal(screening.result, "Pass");
  assert.deepEqual(screening.hits, []);
  assert.equal(screen("").result, "Pass");
});

test("the lexicons are lower-case and free of duplicates, or a term could never fire", () => {
  for (const list of [INSIDER_PHRASES, EVENT_TERMS, ISSUER_LEXICON]) {
    for (const term of list) {
      assert.equal(term, term.toLowerCase(), term);
      assert.equal(term.trim(), term, term);
    }
    assert.equal(new Set(list).size, list.length);
  }
});
