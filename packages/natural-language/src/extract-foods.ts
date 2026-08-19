import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import type { ExtractedValue, FoodComponentExtraction, FoodComponentQuantityKind, MealExtraction } from "./types.js";

/**
 * Foods whose typical quantity does not materially change a carbohydrate
 * calculation (near-zero-carbohydrate proteins/fats) - the app must not ask
 * for a quantity that cannot materially affect the result. This is a
 * deliberately short, conservative list; anything not on it is treated as
 * potentially carbohydrate-relevant and, if unquantified, produces a
 * blocking clarification instead of silently guessing.
 */
const NEGLIGIBLE_CARB_FOODS = [
  "ham",
  "chicken",
  "turkey",
  "beef",
  "bacon",
  "egg",
  "eggs",
  "cheese",
  "lettuce",
  "mayo",
  "mayonnaise",
  "mustard",
  "butter",
  "margarine",
  "oil",
];

/** "a little", "some", "a bowl of", "a glass of", "a handful of", "a splash of" - vague, non-numeric quantifiers. */
const VAGUE_QUALIFIER_PATTERN =
  /\b(a\s+little|some|a\s+few|a\s+bit\s+of|a\s+bowl\s+of|a\s+glass\s+of|a\s+handful\s+of|a\s+hand\s+of|a\s+splash\s+of|a\s+cup\s+of)\b/i;

/** Exact colloquial counts are deterministic; only "a few" remains intentionally vague. */
const COLLOQUIAL_COUNT_PATTERN = /^(?:(?:a\s+)?(couple|pair|dozen)(?:\s+of)?|(both))\s+(.+)$/i;
const COLLOQUIAL_COUNT_VALUES: Record<string, number> = { couple: 2, pair: 2, both: 2, dozen: 12 };
/** A serving names an intent, not a numeric portion. A database measure must be selected in review. */
const SERVING_PATTERN = /^(?:a|an|one)\s+(?:serving|portion|helping)\s+of\s+(.+)$/i;

/** "sandwich"/"wrap"/"burger"/"roll" as a container noun implies its named filling is the real food component. */
const CONTAINER_NOUN_PATTERN = /\b(?:a|an)\s+([a-z]+)\s+(sandwich|wrap|burger|roll)\b/i;

/**
 * "a meal of", "a plate of", "a serving of" etc. are generic containment
 * phrases, not food names or quantities - the actual food named after them
 * is the real component. Stripped before any quantity/unit pattern runs so
 * "a meal of bread" resolves to the food "bread" (with no stated quantity,
 * which still correctly blocks for a carbohydrate-relevant food like
 * bread), not to a bogus food literally named "meal of bread".
 */
const MEAL_FILLER_LEAD_IN_PATTERN = /^(?:a|an|the)?\s*(?:meal|plate)\s+of\s+/i;

const COUNTABLE_UNIT_WORDS = [
  "slice",
  "slices",
  "piece",
  "pieces",
  "cup",
  "cups",
  "biscuit",
  "biscuits",
  "cookie",
  "cookies",
  "cracker",
  "crackers",
  "bar",
  "bars",
  "roll",
  "rolls",
];
const VOLUME_UNIT_WORDS = ["ml", "millilitre", "millilitres"];
const WEIGHT_UNIT_WORDS = ["gram", "grams", "g"];

const ALL_UNIT_WORDS = [...COUNTABLE_UNIT_WORDS, ...VOLUME_UNIT_WORDS, ...WEIGHT_UNIT_WORDS];
const LEADING_QUANTITY_PATTERN = new RegExp(
  `^(${QUANTITY_PATTERN})\\s+(${ALL_UNIT_WORDS.join("|")})(?:\\s+of)?\\s+(.+)$`,
  "i",
);
const LEADING_FRACTION_OF_UNIT_PATTERN = new RegExp(
  `^(${QUANTITY_PATTERN})\\s+of\\s+(?:a|an)\\s+(${ALL_UNIT_WORDS.join("|")})\\s+of\\s+(.+)$`,
  "i",
);
const LEADING_BARE_COUNT_PATTERN = new RegExp(`^(${QUANTITY_PATTERN})\\s+(?:a|an)\\s+(.+)$|^(${QUANTITY_PATTERN})\\s+(.+)$`, "i");
const LEADING_UNIT_NO_OF_PATTERN = new RegExp(
  `^(${QUANTITY_PATTERN})\\s+(${[...VOLUME_UNIT_WORDS, ...WEIGHT_UNIT_WORDS].join("|")})\\s+(?:of\\s+)?(.+)$`,
  "i",
);

/** Finds where a meal description starts within a larger, possibly multi-topic sentence. */
const MEAL_TRIGGER_PATTERN = /\b(?:i(?:'m| am)?\s+)?(?:now\s+|just\s+)?(?:eating|having|eat|ate|consumed|finished|drinking|drank)\b\s*|\b(?:i\s+)?(?:just\s+)?had(?=\s+(?:some|a|an|the|my)\b)\s*/i;

function isNegligibleCarb(phrase: string): boolean {
  const normalisedPhrase = phrase.trim().toLowerCase();
  return NEGLIGIBLE_CARB_FOODS.some(
    (food) => normalisedPhrase === food || normalisedPhrase.endsWith(` ${food}`) || normalisedPhrase.startsWith(`${food} `),
  );
}

function unitKindFor(unitWord: string | null): FoodComponentQuantityKind {
  if (!unitWord) return "UNKNOWN";
  const lower = unitWord.toLowerCase();
  if (VOLUME_UNIT_WORDS.includes(lower)) return "MILLILITRES";
  if (WEIGHT_UNIT_WORDS.includes(lower)) return "GRAMS";
  if (COUNTABLE_UNIT_WORDS.includes(lower)) return "COUNT";
  return "UNKNOWN";
}

function buildComponent(rawMention: string): FoodComponentExtraction {
  const mention = rawMention.trim().replace(MEAL_FILLER_LEAD_IN_PATTERN, "");

  const servingMatch = mention.match(SERVING_PATTERN);
  const colloquialCount = !servingMatch ? mention.match(COLLOQUIAL_COUNT_PATTERN) : null;
  const withOf = !servingMatch && !colloquialCount ? mention.match(LEADING_QUANTITY_PATTERN) : null;
  const fractionOfUnit = !servingMatch && !colloquialCount && !withOf ? mention.match(LEADING_FRACTION_OF_UNIT_PATTERN) : null;
  const withUnitNoOf = !servingMatch && !colloquialCount && !withOf && !fractionOfUnit ? mention.match(LEADING_UNIT_NO_OF_PATTERN) : null;
  const bareCount = !servingMatch && !colloquialCount && !withOf && !fractionOfUnit && !withUnitNoOf ? mention.match(LEADING_BARE_COUNT_PATTERN) : null;
  const vagueMatch = !servingMatch && !colloquialCount ? mention.match(VAGUE_QUALIFIER_PATTERN) : null;
  const containerMatch = mention.match(CONTAINER_NOUN_PATTERN);

  let phrase = mention;
  let quantityValue: number | null = null;
  let quantityKind: FoodComponentQuantityKind = "UNKNOWN";
  let unitWord: string | null = null;
  let rawSpan = mention;

  if (servingMatch) {
    quantityValue = 1;
    unitWord = "serving";
    phrase = servingMatch[1]!.trim();
    quantityKind = "SERVING";
    rawSpan = mention;
  } else if (colloquialCount) {
    const label = (colloquialCount[1] ?? colloquialCount[2] ?? "").toLowerCase();
    quantityValue = COLLOQUIAL_COUNT_VALUES[label] ?? null;
    unitWord = label === "pair" ? "pair" : label === "dozen" ? "dozen" : "items";
    phrase = colloquialCount[3]!.trim();
    quantityKind = "COUNT";
    rawSpan = mention;
  } else if (withOf) {
    quantityValue = parseQuantityToken(withOf[1]!);
    unitWord = withOf[2]!;
    phrase = withOf[3]!.trim();
    quantityKind = unitKindFor(unitWord);
    rawSpan = mention;
  } else if (fractionOfUnit) {
    quantityValue = parseQuantityToken(fractionOfUnit[1]!);
    unitWord = fractionOfUnit[2]!;
    phrase = fractionOfUnit[3]!.trim();
    quantityKind = unitKindFor(unitWord);
    rawSpan = mention;
  } else if (withUnitNoOf) {
    quantityValue = parseQuantityToken(withUnitNoOf[1]!);
    unitWord = withUnitNoOf[2]!;
    phrase = withUnitNoOf[3]!.trim();
    quantityKind = unitKindFor(unitWord);
    rawSpan = mention;
  } else if (containerMatch) {
    // "a ham sandwich" -> the filling ("ham") is the real food component;
    // the container noun ("sandwich") is not itself a carbohydrate source
    // here because its bread is (or should be) a separate stated mention.
    phrase = containerMatch[1]!;
    rawSpan = containerMatch[0];
  } else if (vagueMatch) {
    phrase = mention.replace(VAGUE_QUALIFIER_PATTERN, "").trim();
    quantityKind = "VAGUE";
    rawSpan = mention;
  } else if (bareCount && !vagueMatch) {
    const asNumber = parseQuantityToken(bareCount[1] ?? bareCount[3] ?? "");
    if (asNumber !== null) {
      quantityValue = asNumber;
      quantityKind = "COUNT";
      phrase = (bareCount[2] ?? bareCount[4] ?? "").trim();
      rawSpan = mention;
    }
  }

  // A phrase such as "a third of a cup of rice" contains "a cup of", but
  // its quantity and unit were already parsed deterministically. Only retain
  // a vague qualifier when no numeric quantity was extracted.
  const qualifier = quantityValue === null && vagueMatch ? vagueMatch[0] : null;
  const hasAnyQuantitySignal = quantityValue !== null || qualifier !== null;
  const negligible = isNegligibleCarb(phrase);

  const quantity: ExtractedValue<number> =
    quantityValue !== null
      ? { rawSpan, value: quantityValue, confidence: 0.85, status: "provisional", requiresConfirmation: true }
      : { rawSpan: qualifier ?? "", value: null, confidence: qualifier ? 0.3 : 0, status: hasAnyQuantitySignal ? "requires_review" : "missing", requiresConfirmation: true };

  const unit: ExtractedValue<string> =
    unitWord !== null
      ? { rawSpan: unitWord, value: unitWord.toLowerCase(), confidence: 0.85, status: "provisional", requiresConfirmation: true }
      : { rawSpan: "", value: null, confidence: 0, status: qualifier ? "requires_review" : "missing", requiresConfirmation: true };

  let matchStatus: FoodComponentExtraction["matchStatus"];
  let quantityNeededForCalculation: boolean;

  if (quantityKind === "SERVING") {
    // The phrase identifies a serving intent but not which database measure.
    // Do not translate it into grams or a default household portion here.
    matchStatus = "requires_review";
    quantityNeededForCalculation = true;
  } else if (qualifier && !negligible) {
    // A vague amount was explicitly stated for a carbohydrate-relevant food.
    // Respect that the patient quantified it, even loosely, and let them
    // resolve it precisely rather than inventing a portion.
    matchStatus = "requires_review";
    quantityNeededForCalculation = true;
  } else if (quantityValue !== null) {
    matchStatus = "provisional";
    quantityNeededForCalculation = true;
  } else if (negligible) {
    // No precise quantity is needed for a known negligible-carbohydrate
    // condiment/protein, even when the patient used a vague qualifier such
    // as "some chipotle mayo". It contributes zero rather than causing an
    // unrelated food-match failure or an unnecessary question.
    matchStatus = "provisional";
    quantityNeededForCalculation = false;
  } else {
    // No quantity, no qualifier, and this food's amount does matter -
    // this must block until the patient supplies a quantity.
    matchStatus = "missing";
    quantityNeededForCalculation = true;
  }

  return {
    phrase: phrase || mention,
    rawSpan,
    quantity,
    unit,
    quantityKind,
    selectedServingMeasureId: null,
    qualifier,
    matchStatus,
    quantityNeededForCalculation,
  };
}

/**
 * Segments a meal description out of the full (possibly multi-topic)
 * dictated text and into individual food/drink components. Returns null if
 * the text contains no food/eating/drinking language at all. This searches
 * the whole text for the eating/having trigger rather than requiring the
 * caller to pre-isolate a "food clause" - run-on dictated sentences like
 * "my glucose is 8.4 and I'm having two Weet-Bix with milk" have no
 * punctuation separating the glucose mention from the meal mention. Every
 * component is a candidate for review - nothing here calculates
 * carbohydrate; that happens later, only after the food has been matched
 * against the food database/custom foods and the user has confirmed it.
 */
export function extractFoods(text: string): MealExtraction | null {
  const triggerMatch = text.match(MEAL_TRIGGER_PATTERN);
  if (!triggerMatch || triggerMatch.index === undefined) return null;

  const afterTrigger = text.slice(triggerMatch.index + triggerMatch[0].length);
  const sentenceEnd = afterTrigger.search(/[.;]/);
  const mealSegment = sentenceEnd === -1 ? afterTrigger : afterTrigger.slice(0, sentenceEnd);

  const mentions = mealSegment
    .split(/\bwith\b|\band\b|,/i)
    .map((mention) => mention.trim())
    .filter((mention) => mention.length > 0);

  if (mentions.length === 0) return null;

  const components = mentions.map(buildComponent).filter((component) => component.phrase.length > 0);
  const containerMatch = mealSegment.match(CONTAINER_NOUN_PATTERN);
  const containerContext = containerMatch ? containerMatch[2]! : null;

  return { components, containerContext };
}
