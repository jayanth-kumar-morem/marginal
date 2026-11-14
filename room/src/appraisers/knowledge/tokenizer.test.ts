import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MODEL_DIR } from "./embed.js";
import { MAX_TOKENS, encode, isPunctuation, normalize, preTokenize, wordPiece, type TokenizerModel } from "./tokenizer.js";

const model = JSON.parse(readFileSync(`${MODEL_DIR}tokenizer.json`, "utf8")) as TokenizerModel;
const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../fixtures/minilm-vectors.json", import.meta.url)), "utf8"),
) as { cases: { text: string; ids: number[] }[] };

/**
 * The reference implementation's own token ids. Hand-rolling a tokenizer is only defensible if it
 * agrees with the one the model was trained with, token for token.
 */
test("every fixture's token ids are the reference implementation's", () => {
  assert.ok(vectors.cases.length >= 7, "the fixture has cases");
  for (const vector of vectors.cases) {
    assert.deepEqual(encode(vector.text, model).ids, vector.ids, JSON.stringify(vector.text.slice(0, 40)));
  }
});

test("the normalizer cleans, spaces out CJK, strips accents and lower-cases", () => {
  assert.equal(normalize("Café NAÏVE", model), "cafe naive");
  assert.equal(normalize("a\tb\nc\rd", model), "a b c d");
  assert.equal(normalize("x\u0000y", model), "xy", "control characters go");
  assert.equal(normalize("東京", model), " 東  京 ", "each CJK character is its own token");
});

test("the pre-tokenizer splits on whitespace and makes punctuation its own token", () => {
  assert.deepEqual(preTokenize("hello, world!"), ["hello", ",", "world", "!"]);
  assert.deepEqual(preTokenize("  spaced   out  "), ["spaced", "out"]);
  assert.deepEqual(preTokenize("(parens)"), ["(", "parens", ")"]);
  assert.deepEqual(preTokenize(""), []);
  assert.deepEqual(preTokenize("a1b2"), ["a1b2"], "digits and letters stay together");
});

test("word pieces are the longest match from the left, with the continuation prefix", () => {
  assert.deepEqual(wordPiece("tokenisation", model), ["token", "##isation"]);
  assert.deepEqual(wordPiece("the", model), ["the"]);
  // Longer than the model's limit, or made of nothing in the vocabulary: one [UNK].
  assert.deepEqual(wordPiece("x".repeat(101), model), ["[UNK]"]);
  assert.deepEqual(wordPiece("ЖЖЖ", model), ["[UNK]"]);
});

test("a long input is truncated with its [SEP] kept, and short ones are padded", () => {
  const long = encode("one two three four five six seven eight nine ten ".repeat(40), model);
  assert.equal(long.ids.length, MAX_TOKENS);
  assert.equal(long.ids[0], 101, "[CLS]");
  assert.equal(long.ids.at(-1), 102, "[SEP] survives truncation");
  assert.equal(long.attentionMask.filter((bit) => bit === 1).length, MAX_TOKENS);

  const short = encode("two words", model);
  assert.equal(short.ids.length, MAX_TOKENS);
  assert.equal(short.ids.at(-1), 0, "padded with [PAD]");
  assert.deepEqual(short.attentionMask.slice(0, 5), [1, 1, 1, 1, 0]);
  assert.deepEqual(short.typeIds, short.ids.map(() => 0), "one sequence, so every type id is zero");
});

test("a vocabulary without the special tokens is refused, whichever one is missing", () => {
  const vocabs: Record<string, number>[] = [
    { the: 1 },
    { the: 1, "[CLS]": 101 },
    { the: 1, "[CLS]": 101, "[SEP]": 102 },
  ];
  for (const vocab of vocabs) {
    const broken = { ...model, model: { ...model.model, vocab } };
    assert.throws(() => encode("the", broken), /no \[CLS\], \[SEP\] and \[PAD\]/, JSON.stringify(vocab));
  }
  // With all three it encodes, so the check is about those three and nothing else.
  const minimal = { ...model, model: { ...model.model, vocab: { the: 1, "[CLS]": 101, "[SEP]": 102, "[PAD]": 0 } } };
  assert.deepEqual(encode("the", minimal).ids.slice(0, 3), [101, 1, 102]);
});

test("punctuation is BERT's own list: ASCII symbols and Unicode punctuation, not every symbol", () => {
  for (const character of [",", ".", "!", "(", "[", "@", "#", "$", "+", "~", "\u2014", "\u00bf"]) {
    assert.equal(isPunctuation(character), true, character);
  }
  // A currency sign or a maths symbol outside ASCII is not punctuation, which is what the
  // reference tokenizer does — and the fixture would catch it if this drifted.
  for (const character of ["\u20ac", "\u00d7", "a", "1", " ", "\u6771", "\u007f"]) {
    assert.equal(isPunctuation(character), false, character);
  }
});

test("a normalizer that neither lower-cases nor spaces out CJK leaves both alone", () => {
  const plain = {
    ...model,
    normalizer: { lowercase: false, handle_chinese_chars: false },
  };
  assert.equal(normalize("Caf\u00e9 \u6771", plain), "Caf\u00e9 \u6771");
  assert.equal(normalize("Caf\u00e9", { ...model, normalizer: { lowercase: true, handle_chinese_chars: false } }), "cafe");
});
