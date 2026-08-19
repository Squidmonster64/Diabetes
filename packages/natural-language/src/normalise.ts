/**
 * Deterministic text normalisation shared by every extractor. Never invents
 * clinical content: it only resolves constrained surface-form variants such as
 * case, whitespace, unit spellings, dictated decimal wording, and known
 * transcription substitutions. The original text is always preserved by the
 * caller for display and audit.
 */

const DIRECT_WORD_NUMBERS: Record<string, number> = {
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
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ONE_TO_NINE_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const DIRECT_NUMBER_WORD_PATTERN = Object.keys(DIRECT_WORD_NUMBERS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const TENS_WORD_PATTERN = Object.keys(TENS_WORDS).join("|");
const ONE_TO_NINE_WORD_PATTERN = ONE_TO_NINE_WORDS.join("|");

/**
 * Converts a supported spoken number ("two", "thirty five", "thirty-five",
 * "one hundred") to a digit. It deliberately does not attempt open-ended
 * language interpretation or make a value plausible by clinical range.
 */
export function wordToNumber(word: string): number | null {
  const normalised = word.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (normalised in DIRECT_WORD_NUMBERS) return DIRECT_WORD_NUMBERS[normalised]!;
  if (normalised === "one hundred") return 100;

  const [tens, ones, ...rest] = normalised.split(" ");
  if (rest.length === 0 && tens && ones && tens in TENS_WORDS && ones in DIRECT_WORD_NUMBERS) {
    const oneValue = DIRECT_WORD_NUMBERS[ones]!;
    if (oneValue >= 1 && oneValue <= 9) return TENS_WORDS[tens]! + oneValue;
  }
  return null;
}

/** Regex alternation of every recognised number phrase for embedding in extractor patterns. */
export const NUMBER_WORD_PATTERN = `(?:one\\s+hundred|(?:${TENS_WORD_PATTERN})(?:[-\\s]+(?:${ONE_TO_NINE_WORD_PATTERN}))?|${DIRECT_NUMBER_WORD_PATTERN})`;

/**
 * Common spoken fractions that can safely be represented as deterministic
 * numeric amounts. They still require review downstream; the parser never
 * converts them into carbohydrate amounts by itself.
 */
const FRACTION_WORDS: Record<string, number> = {
  "a half": 0.5,
  "one half": 0.5,
  half: 0.5,
  "a third": 1 / 3,
  "one third": 1 / 3,
  third: 1 / 3,
  "a quarter": 0.25,
  "one quarter": 0.25,
  quarter: 0.25,
  "three quarters": 0.75,
};

/** Longest-first so multi-word fractions are captured as one quantity. */
export const FRACTION_WORD_PATTERN = Object.keys(FRACTION_WORDS)
  .sort((a, b) => b.length - a.length)
  .map((value) => value.replaceAll(" ", "\\s+"))
  .join("|");

/** Matches a digit, a supported spoken fraction, or a recognised number phrase. */
export const QUANTITY_PATTERN = `(?:\\d+(?:\\.\\d+)?|${FRACTION_WORD_PATTERN}|${NUMBER_WORD_PATTERN})`;

/** Parses a supported quantity token to a number, or returns null if unparseable. */
export function parseQuantityToken(token: string): number | null {
  const trimmed = token.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed in FRACTION_WORDS) return FRACTION_WORDS[trimmed]!;
  return wordToNumber(trimmed);
}

const TRANSCRIPTION_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  // Restricted to unambiguous clinical cue words and never used to fabricate a value.
  [/\bgluc(?:os|osee|osse|os)\b/g, "glucose"],
  [/\bsug(?:ar|er)s?\b/g, "sugar"],
  [/\binsul(?:in|ine|en)\b/g, "insulin"],
  [/\b(?:b\.?g\.?l|b\.?s\.?l)\b/g, "blood glucose"],
  [/\bunit(?:s|z|zs)\b/g, "units"],
  // Voice transcription commonly writes the homophone in a quantity + unit context.
  [/\bfor(?=\s+(?:units?|slices?|pieces?|biscuits?|table?s?poons?|tea?s?poons?|cups?)\b)/g, "four"],
  [/\bto(?=\s+(?:units?|slices?|pieces?|biscuits?|table?s?poons?|tea?s?poons?|cups?)\b)/g, "two"],
  [/\bate(?=\s+(?:units?|slices?|pieces?|biscuits?|table?s?poons?|tea?s?poons?|cups?)\b)/g, "eight"],
];

const UNIT_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmillilitres?\b/g, "ml"],
  [/\bmilliliters?\b/g, "ml"],
  [/\bmils?\b/g, "ml"],
  [/\bmls?\b/g, "ml"],
  [/\bmillimoles? per lit(?:re|er)\b/g, "mmol/l"],
  [/\bmillimoles?\b/g, "mmol/l"],
  [/\bmmol\s*(?:\/|per)\s*l\b/g, "mmol/l"],
  [/\bmmol\b/g, "mmol/l"],
  [/\bmilligrams? per decilit(?:re|er)\b/g, "mg/dl"],
  [/\bmg\s*(?:\/|per|\s)\s*dl\b/g, "mg/dl"],
  [/\bgrammes?\b/g, "grams"],
  [/\bgm?s?\b(?=\s|$)/g, "grams"],
  [/\btables?poons?\b/g, "tbsp"],
  [/\btbsp\.?\b/g, "tbsp"],
  [/\btea?s?poons?\b/g, "tsp"],
  [/\btsp\.?\b/g, "tsp"],
];

function normaliseSpokenDecimal(text: string): string {
  const spokenDecimal = new RegExp(`\\b(${NUMBER_WORD_PATTERN}|\\d+)\\s+point\\s+(${ONE_TO_NINE_WORD_PATTERN}|\\d)\\b`, "g");
  return text.replace(spokenDecimal, (raw, wholeToken: string, fractionToken: string) => {
    const whole = parseQuantityToken(wholeToken);
    const fraction = parseQuantityToken(fractionToken);
    return whole !== null && fraction !== null && fraction >= 0 && fraction <= 9 ? `${whole}.${fraction}` : raw;
  });
}

/**
 * Lowercases, standardises spacing and common unit spellings, and converts
 * tightly-scoped dictated surface forms. It does not replace food words with
 * a database candidate, infer glucose units, or manufacture missing values.
 */
export function normaliseText(rawText: string): string {
  let text = rawText.toLowerCase();
  text = text.replace(/[’‘]/g, "'");
  text = text.replace(/(\d),(\d)/g, "$1.$2");
  // Dictation frequently joins a number to its unit (for example, "200ml").
  text = text.replace(/(\d)(?=(?:ml|mg|mmol|grams?)\b)/g, "$1 ");
  text = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TRANSCRIPTION_REWRITES) text = text.replace(pattern, replacement);
  text = normaliseSpokenDecimal(text);
  for (const [pattern, replacement] of UNIT_SYNONYMS) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Splits normalised text into sentence-ish clauses on '.', ';', and clause
 * conjunctions. A '.' only splits when it is not immediately followed by a
 * digit, so decimal glucose values ("8.4") are never mistaken for a sentence
 * boundary.
 */
export function splitClauses(text: string): string[] {
  return text
    .split(/(?:\.(?!\d)|;|\bwhile\b)/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}
