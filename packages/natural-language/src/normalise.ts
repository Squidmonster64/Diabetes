/**
 * Deterministic text normalisation shared by every extractor. Never invents
 * content - only rewrites surface form (case, whitespace, spelled-out
 * numbers, unit synonyms) so downstream regex-based extractors have a
 * single consistent form to match against. The original text is always
 * preserved separately by the caller (segment-event.ts) - this module never
 * discards information.
 */

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** Converts a single number word ("two", "twelve") to a digit. Returns null if not a known number word. */
export function wordToNumber(word: string): number | null {
  const normalised = word.trim().toLowerCase();
  return normalised in WORD_NUMBERS ? WORD_NUMBERS[normalised]! : null;
}

/** Regex alternation of every recognised number word, for embedding in other patterns. */
export const NUMBER_WORD_PATTERN = Object.keys(WORD_NUMBERS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Matches a digit sequence (optionally decimal) or a recognised number word. */
export const QUANTITY_PATTERN = `(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})`;

/** Parses a quantity token (digit or word) to a number, or null if unparseable. */
export function parseQuantityToken(token: string): number | null {
  const trimmed = token.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return wordToNumber(trimmed);
}

const UNIT_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmillilitres?\b/g, "ml"],
  [/\bmilliliters?\b/g, "ml"],
  [/\bmils\b/g, "ml"],
  [/\bml\b/g, "ml"],
  [/\bmillimoles? per lit(?:re|er)\b/g, "mmol/l"],
  [/\bmmol\s*\/\s*l\b/g, "mmol/l"],
  [/\bmmol\b/g, "mmol/l"],
  [/\bmilligrams? per decilit(?:re|er)\b/g, "mg/dl"],
  [/\bmg\s*\/\s*dl\b/g, "mg/dl"],
  [/\bgrammes?\b/g, "grams"],
  [/\bgm?s?\b(?=\s|$)/g, "grams"],
];

/**
 * Lowercases, collapses whitespace, and rewrites unit spellings to a single
 * canonical form. Does not touch numbers-as-words (extractors decide
 * per-context whether a number word is meaningful) and does not remove any
 * words.
 */
export function normaliseText(rawText: string): string {
  let text = rawText.toLowerCase();
  text = text.replace(/[’‘]/g, "'");
  text = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of UNIT_SYNONYMS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/**
 * Splits normalised text into sentence-ish clauses on '.', ';', and clause
 * conjunctions. A '.' only splits when it is not immediately followed by a
 * digit, so decimal glucose values ("8.4") are never mistaken for a
 * sentence boundary.
 */
export function splitClauses(text: string): string[] {
  return text
    .split(/(?:\.(?!\d)|;|\bwhile\b)/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}
