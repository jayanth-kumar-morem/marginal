/**
 * The BERT WordPiece tokenizer the embedder needs (SDD §3.14.3, §3.15.1; E8.6).
 *
 * Written out rather than imported, because every dependency inside the room is part of its
 * measurement and the alternatives are heavy: `@huggingface/tokenizers` is a native binding and
 * `@huggingface/transformers` drags an image library and a second ONNX runtime in with it. What it
 * has to do is small and fixed — `tokenizer.json` describes a `BertNormalizer`, a
 * `BertPreTokenizer` and a `WordPiece` model, all of which are here — and the result is checked
 * token for token against the reference implementation in `fixtures/minilm-vectors.json`.
 *
 * Determinism matters more than speed here (AC-38): the same text must give the same ids on every
 * machine, so there is nothing locale-dependent and no configuration.
 */

/** What `tokenizer.json` says, as far as this reads it. */
export interface TokenizerModel {
  readonly model: {
    readonly vocab: Record<string, number>;
    readonly unk_token: string;
    readonly continuing_subword_prefix: string;
    readonly max_input_chars_per_word: number;
  };
  readonly normalizer: { readonly lowercase: boolean; readonly handle_chinese_chars: boolean };
}

/** One encoded sequence, padded to a fixed length so every run has the same shape. */
export interface Encoded {
  readonly ids: number[];
  readonly attentionMask: number[];
  readonly typeIds: number[];
}

/** `tokenizer.json`'s own truncation and padding length for this model. */
export const MAX_TOKENS = 128;

const CJK: readonly [number, number][] = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0xf900, 0xfaff],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0x2f800, 0x2fa1f],
];

/**
 * The code point of one character. Both loops here iterate a string with `for...of`, which yields
 * whole code points, so there is always one.
 */
function codeOf(character: string): number {
  return character.codePointAt(0) as number;
}

function isCjk(code: number): boolean {
  return CJK.some(([low, high]) => code >= low && code <= high);
}

/**
 * BERT's own notion of punctuation: the four ASCII symbol ranges, plus anything Unicode calls
 * punctuation. Symbols outside ASCII — a currency sign, say — are **not** punctuation here, which
 * is what the reference tokenizer does, and the fixture would catch it if this drifted.
 */
export function isPunctuation(character: string): boolean {
  const code = codeOf(character);
  if (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  ) {
    return true;
  }
  return /\p{P}/u.test(character);
}

function isControl(character: string): boolean {
  if (character === "\t" || character === "\n" || character === "\r") return false;
  return /\p{Cc}|\p{Cf}|\p{Co}|\p{Cs}/u.test(character);
}

/** `BertNormalizer`: clean the text, space out CJK, strip accents and lower-case. */
export function normalize(text: string, model: TokenizerModel): string {
  let cleaned = "";
  for (const character of text) {
    if (isControl(character)) continue;
    if (/\s/u.test(character)) {
      cleaned += " ";
      continue;
    }
    const code = codeOf(character);
    cleaned +=
      model.normalizer.handle_chinese_chars && isCjk(code) ? ` ${character} ` : character;
  }
  // Accents are stripped whenever the normalizer lower-cases, which is what `strip_accents: null`
  // means in `tokenizer.json`.
  return model.normalizer.lowercase
    ? cleaned.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase()
    : cleaned;
}

/** `BertPreTokenizer`: split on whitespace, then split punctuation into tokens of its own. */
export function preTokenize(text: string): string[] {
  const words: string[] = [];
  for (const chunk of text.split(" ")) {
    if (chunk === "") continue;
    let current = "";
    for (const character of chunk) {
      if (isPunctuation(character)) {
        if (current !== "") words.push(current);
        words.push(character);
        current = "";
        continue;
      }
      current += character;
    }
    if (current !== "") words.push(current);
  }
  return words;
}

/** WordPiece: greedy longest match from the left, with the continuation prefix. */
export function wordPiece(word: string, model: TokenizerModel): string[] {
  const { vocab, unk_token: unk, continuing_subword_prefix: prefix } = model.model;
  const characters = [...word];
  if (characters.length > model.model.max_input_chars_per_word) return [unk];
  const pieces: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = characters.length;
    let piece: string | undefined;
    while (start < end) {
      const candidate = (start > 0 ? prefix : "") + characters.slice(start, end).join("");
      if (candidate in vocab) {
        piece = candidate;
        break;
      }
      end -= 1;
    }
    if (piece === undefined) return [unk];
    pieces.push(piece);
    start = end;
  }
  return pieces;
}

/**
 * Encodes one sequence as the model's three inputs: `[CLS]`, the pieces, `[SEP]`, then padding to
 * [`MAX_TOKENS`]. Anything longer is truncated, exactly as `tokenizer.json`'s own truncation does.
 */
export function encode(text: string, model: TokenizerModel): Encoded {
  const { vocab } = model.model;
  const cls = vocab["[CLS]"];
  const sep = vocab["[SEP]"];
  const pad = vocab["[PAD]"];
  if (cls === undefined || sep === undefined || pad === undefined) {
    throw new Error("tokenizer: the vocabulary has no [CLS], [SEP] and [PAD]");
  }
  const pieces: number[] = [];
  for (const word of preTokenize(normalize(text, model))) {
    for (const piece of wordPiece(word, model)) {
      // `wordPiece` only ever returns keys of the vocabulary, or the unknown token, which is one.
      pieces.push(vocab[piece] as number);
      if (pieces.length >= MAX_TOKENS - 2) break;
    }
    if (pieces.length >= MAX_TOKENS - 2) break;
  }
  const ids = [cls, ...pieces, sep];
  const attentionMask = ids.map(() => 1);
  while (ids.length < MAX_TOKENS) {
    ids.push(pad);
    attentionMask.push(0);
  }
  return { ids, attentionMask, typeIds: ids.map(() => 0) };
}
