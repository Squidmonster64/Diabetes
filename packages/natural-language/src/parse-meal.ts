/**
 * Deterministic multi-item meal parser.
 *
 * Architecture: INPUT TEXT → LANGUAGE PARSING → FOOD COMPONENTS, with
 * quantity bound to the correct food *before* any database lookup.
 * This module never invents nutrition values or insulin doses.
 *
 * A schema-validated language-model overlay may replace this AST at the
 * API boundary. Golden tests must pass with this deterministic parser
 * alone — CI has no model key.
 */
import { parseQuantityToken, QUANTITY_PATTERN } from "./normalise.js";
import type {
  CanonicalFoodUnit,
  MealCompleteness,
  MealParseConfidenceGate,
  ParsedFoodItem,
  ParsedMeal,
} from "./types.js";

const CORRECTION_PATTERN = /\bi meant\s+.+?,?\s*not\s+.+?(?:[.!]|$)/gi;

const MEAL_TRIGGER_PATTERN =
  /\b(?:i(?:'m| am)?\s+)?(?:now\s+|just\s+)?(?:eating|having|eat|ate|consumed|finished|drinking|drank|making)\b\s*|\b(?:i\s+)?(?:just\s+)?had(?=\s+(?:some|a|an|the|my|\d|one|two|three|four|five|six|seven|eight|nine|ten)\b)\s*/i;

const CONTAINER_OF_PATTERN =
  /\b(?:i(?:'m| am)?\s+)?(?:making|having|eating)\s+(?:a\s+)?(sandwich|wrap|burger|roll)\s+of\b/i;

const FILLER_LEAD_IN_PATTERN = /^(?:a|an|the)?\s*(?:meal|plate)\s+of\s+/i;

const GLUCOSE_CLAUSE_PATTERN =
  /\b(?:my\s+)?(?:blood\s+)?(?:glucose|sugar|bgl|bsl|bg)\s+(?:is|was|reads?|reading|of|at|sitting\s+at|currently)?\s*(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+point\s+\w+)?(?:\s*(?:mmol(?:\s*\/\s*l)?|mg\s*\/\s*dl))?/gi;

const INSULIN_CLAUSE_PATTERN =
  /\b(?:i\s+)?(?:took|had|taken|injected|dosed|administered|shot|jabbed|bolused|gave\s+myself)\s+(?:my\s+)?(?:(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|units?).{0,40}?)(?:insulin|novorapid|novo\s+rapid|novolog|humalog|apidra|fiasp|lyumjev|actrapid)\b(?:\s+(?:about\s+)?(?:\d+(?:\.\d+)?|an|a|one|two|three|four|five|six|seven|eight|nine|ten|thirty|forty|fifty|sixty)\s+(?:hours?|minutes?)\s+ago)?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?(?:\s+this\s+morning)?/gi;

const INSULIN_NO_AMOUNT_PATTERN =
  /\b(?:i\s+)?(?:took|had|injected|bolused)\s+units?(?:\s+of)?(?:\s+insulin)?\b[^.;]*/gi;

const CONNECTORS = new Set(["and", "with", "plus", ",", "&", "then"]);
const FILLER_WORDS = new Set(["i", "im", "am", "just", "now", "of", "the", "my", "me"]);
const SIZE_WORDS = new Set(["large", "medium", "small", "extra-large", "extralarge", "xl", "tall", "short"]);
const KEEP_CONTAINER_BRANDS = new Set(["subway", "mcdonalds", "mcdonald's", "hungry", "jacks"]);

const VAGUE_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^a\s+little\b/, label: "a little" },
  { pattern: /^a\s+few\b/, label: "a few" },
  { pattern: /^a\s+bit\s+of\b/, label: "a bit of" },
  { pattern: /^a\s+hand\s+of\b/, label: "a hand of" },
  { pattern: /^a\s+splash\s+of\b/, label: "a splash of" },
  { pattern: /^lots\s+of\b/, label: "lots of" },
  { pattern: /^a\s+lot\s+of\b/, label: "a lot of" },
  { pattern: /^some\b/, label: "some" },
];

const UNIT_ENTRIES: Array<{ pattern: RegExp; canonical: CanonicalFoodUnit; original: string }> = [
  { pattern: /^(?:tablespoons?|tbsp)$/, canonical: "tablespoon", original: "tbsp" },
  { pattern: /^(?:teaspoons?|tsp)$/, canonical: "teaspoon", original: "tsp" },
  { pattern: /^(?:millilitres?|milliliters?|mls|mils|ml)$/, canonical: "ml", original: "ml" },
  { pattern: /^(?:grams?|grammes?|gms|gm|g)$/, canonical: "g", original: "g" },
  { pattern: /^(?:kilograms?|kgs|kg)$/, canonical: "kg", original: "kg" },
  { pattern: /^(?:litres?|liters?|l)$/, canonical: "l", original: "l" },
  { pattern: /^slices?$/, canonical: "slice", original: "slices" },
  { pattern: /^(?:pieces?|bits?)$/, canonical: "piece", original: "pieces" },
  { pattern: /^cups?$/, canonical: "cup", original: "cup" },
  { pattern: /^(?:servings?|serves|portions?|helpings?)$/, canonical: "serving", original: "serving" },
  { pattern: /^(?:packets?|packs?)$/, canonical: "packet", original: "packet" },
  { pattern: /^cans?$/, canonical: "can", original: "can" },
  { pattern: /^bottles?$/, canonical: "bottle", original: "bottle" },
  { pattern: /^handfuls?$/, canonical: "handful", original: "handful" },
  { pattern: /^whole$/, canonical: "whole", original: "whole" },
  { pattern: /^(?:bowls?|glasses?)$/, canonical: "serving", original: "serving" },
];

const COLLOQUIAL_COUNTS: Array<{ pattern: RegExp; value: number; label: string }> = [
  { pattern: /^(?:a\s+)?couple(?:\s+of)?$/, value: 2, label: "couple" },
  { pattern: /^(?:a\s+)?pair(?:\s+of)?$/, value: 2, label: "pair" },
  { pattern: /^both$/, value: 2, label: "both" },
  { pattern: /^(?:a\s+)?dozen(?:\s+of)?$/, value: 12, label: "dozen" },
];

const FRACTION_PHRASES: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /^three\s+quarters$/, value: 0.75 },
  { pattern: /^(?:a|one)\s+half$/, value: 0.5 },
  { pattern: /^(?:a|one)\s+third$/, value: 1 / 3 },
  { pattern: /^(?:a|one)\s+quarter$/, value: 0.25 },
  { pattern: /^half$/, value: 0.5 },
  { pattern: /^quarter$/, value: 0.25 },
  { pattern: /^third$/, value: 1 / 3 },
];

const FOOD_ALIASES: Record<string, string> = {
  nana: "banana",
  nanas: "banana",
  banana: "banana",
  bananas: "banana",
  weetbix: "weet-bix",
  "weet bix": "weet-bix",
  "weet-bix": "weet-bix",
  coke: "coke",
  pepsi: "pepsi",
  chips: "chips",
  "white toast": "white toast",
  toast: "toast",
};

const SINGULAR: Record<string, string> = {
  bananas: "banana",
  eggs: "egg",
  slices: "slice",
  sugars: "sugar",
  biscuits: "biscuits",
  grapes: "grapes",
  pretzels: "pretzels",
  cookies: "cookies",
  crackers: "crackers",
};

const COUNTABLE_FOODS = new Set([
  "banana",
  "egg",
  "avocado",
  "sandwich",
  "wrap",
  "burger",
  "roll",
  "weet-bix",
  "biscuit",
  "biscuits",
  "cookie",
  "cookies",
  "cracker",
  "crackers",
  "grape",
  "grapes",
  "pretzel",
  "pretzels",
  "yogurt",
  "yoghurt",
  "coke",
  "steak",
]);

const SLICE_FOODS = new Set(["toast", "bread", "white bread", "white toast", "sourdough"]);

const NON_FOOD_TOKENS = new Set([
  "hours",
  "hour",
  "minutes",
  "minute",
  "ago",
  "morning",
  "afternoon",
  "evening",
  "units",
  "unit",
  "insulin",
  "glucose",
  "mmol",
  "mmol/l",
  "mg/dl",
  "blood",
  "feel",
  "felt",
  "shaky",
  "dizzy",
  "about",
  "this",
  "that",
  "was",
  "were",
  "is",
  "are",
  "did",
  "do",
  "please",
  "verify",
  "change",
  "update",
  "set",
  "adjust",
  "ratio",
  "icr",
  "isf",
  "logging",
  "log",
  "record",
  "going",
  "sure",
  "what",
]);

const SIGNIFICANT_FOOD_LEMMAS = [
  "banana",
  "bananas",
  "bread",
  "butter",
  "toast",
  "jam",
  "milk",
  "coffee",
  "egg",
  "eggs",
  "avocado",
  "steak",
  "chips",
  "salad",
  "cereal",
  "sandwich",
  "mayo",
  "mayonnaise",
  "cheese",
  "tomato",
  "ham",
  "chicken",
  "coke",
  "weet-bix",
  "weetbix",
  "peanut",
  "yogurt",
  "yoghurt",
  "juice",
  "rice",
  "pasta",
  "cashews",
  "pretzels",
  "grapes",
  "biscuits",
  "cookies",
  "crackers",
  "sugar",
  "sugars",
  "flat white",
  "sourdough",
];

export const PARSED_MEAL_SCHEMA_VERSION = 1;

function canonicalizeFoodName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").toLowerCase().replace(/['’]/g, "");
  if (!trimmed) return trimmed;
  if (FOOD_ALIASES[trimmed]) return FOOD_ALIASES[trimmed]!;
  const last = trimmed.split(" ").pop() ?? trimmed;
  if (SINGULAR[last] && last !== SINGULAR[last]) {
    const parts = trimmed.split(" ");
    parts[parts.length - 1] = SINGULAR[last]!;
    const joined = parts.join(" ");
    return FOOD_ALIASES[joined] ?? joined;
  }
  return trimmed;
}

function matchUnit(token: string): { canonical: CanonicalFoodUnit; original: string } | null {
  const lower = token.toLowerCase();
  for (const entry of UNIT_ENTRIES) {
    if (entry.pattern.test(lower)) {
      return { canonical: entry.canonical, original: token.toLowerCase() };
    }
  }
  return null;
}

function isUnitToken(token: string | undefined): boolean {
  return Boolean(token && matchUnit(token));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/(\d)\s*[x×]\s*/gi, "$1 ")
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a: string, b: string) => {
      const denom = Number(b);
      return denom === 0 ? `${a} / ${b}` : String(Number(a) / denom);
    })
    .replace(/(\d+(?:\.\d+)?)(g|gm|gms|kg|ml|mls|mils|tbsp|tsp)\b/gi, "$1 $2")
    .replace(/[,;]/g, " , ")
    .replace(/[()] /g, " ")
    .replace(/[.](?!\d)/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function joinFrom(tokens: readonly string[], start: number, count: number): string {
  return tokens.slice(start, start + count).join(" ");
}

function tryMatchFrom(
  tokens: readonly string[],
  index: number,
  pattern: RegExp,
  maxWords: number,
): { length: number; text: string } | null {
  const max = Math.min(maxWords, tokens.length - index);
  for (let length = max; length >= 1; length -= 1) {
    const text = joinFrom(tokens, index, length);
    if (pattern.test(text)) return { length, text };
  }
  return null;
}

function tryVague(tokens: readonly string[], index: number): { length: number; label: string } | null {
  const window = joinFrom(tokens, index, Math.min(4, tokens.length - index));
  for (const phrase of VAGUE_PHRASES) {
    const match = window.match(phrase.pattern);
    if (match) return { length: match[0].split(/\s+/).length, label: phrase.label };
  }
  return null;
}

function tryColloquialCount(tokens: readonly string[], index: number): { length: number; value: number; label: string } | null {
  for (const entry of COLLOQUIAL_COUNTS) {
    const matched = tryMatchFrom(tokens, index, entry.pattern, 3);
    if (matched) return { length: matched.length, value: entry.value, label: entry.label };
  }
  return null;
}

function tryFraction(tokens: readonly string[], index: number): { length: number; value: number } | null {
  for (const entry of FRACTION_PHRASES) {
    const matched = tryMatchFrom(tokens, index, entry.pattern, 3);
    if (matched) return { length: matched.length, value: entry.value };
  }
  return null;
}

function tryNumericToken(token: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return parseQuantityToken(token);
}

function tryQuantity(
  tokens: readonly string[],
  index: number,
): { length: number; value: number; unit: ReturnType<typeof matchUnit> } | null {
  const colloquial = tryColloquialCount(tokens, index);
  if (colloquial) return { length: colloquial.length, value: colloquial.value, unit: null };

  const fraction = tryFraction(tokens, index);
  if (fraction) return { length: fraction.length, value: fraction.value, unit: null };

  const twoWordNumber = tokens[index + 1] ? parseQuantityToken(`${tokens[index]} ${tokens[index + 1]}`) : null;
  const firstWordNumber = parseQuantityToken(tokens[index] ?? "");
  if (twoWordNumber !== null && firstWordNumber !== twoWordNumber) {
    return { length: 2, value: twoWordNumber, unit: null };
  }

  const token = tokens[index];
  if (!token) return null;

  const attached = token.match(/^(\d+(?:\.\d+)?)(g|gm|gms|kg|ml|mls|tbsp|tsp)$/i);
  if (attached) {
    return { length: 1, value: Number(attached[1]), unit: matchUnit(attached[2]!) };
  }

  const numeric = tryNumericToken(token);
  if (numeric === null) return null;
  if (token === "a" || token === "an") {
    if (tryVague(tokens, index)) return null;
  }
  return { length: 1, value: numeric, unit: null };
}

function looksLikeQuantityStart(tokens: readonly string[], index: number): boolean {
  if (index >= tokens.length) return false;
  const token = tokens[index];
  if (!token || CONNECTORS.has(token) || FILLER_WORDS.has(token)) return false;
  if (tryVague(tokens, index)) return true;
  if (tryQuantity(tokens, index)) return true;
  if (isUnitToken(token) && tokens[index + 1] === "of") return true;
  return false;
}

function restHasUnquantifiedSandwich(tokens: readonly string[], from: number): boolean {
  const rest = tokens.slice(from);
  const sandwichAt = rest.findIndex((token) => /^(?:sandwich|wrap|burger|roll)es?$/.test(token));
  if (sandwichAt <= 0) return false;
  const between = rest.slice(0, sandwichAt);
  return !between.some((_, offset) => looksLikeQuantityStart(rest, offset));
}

function collectFoodName(
  tokens: readonly string[],
  start: number,
): { words: string[]; next: number } {
  const words: string[] = [];
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (CONNECTORS.has(token)) {
      if (token === "and" && restHasUnquantifiedSandwich(tokens, index + 1)) {
        words.push(token);
        index += 1;
        continue;
      }
      break;
    }
    if (words.length > 0 && SIZE_WORDS.has(token)) break;
    if (words.length > 0 && looksLikeQuantityStart(tokens, index)) break;
    if (words.length > 0 && isUnitToken(token) && tokens[index + 1] === "of") break;
    if (FILLER_WORDS.has(token) && token !== "of" && words.length === 0) {
      index += 1;
      continue;
    }
    if ((token === "a" || token === "an") && words.length === 0) {
      index += 1;
      continue;
    }
    if (token === "of" && words.length > 0) break;
    words.push(token);
    index += 1;
  }
  while (words.length > 0 && (words[words.length - 1] === "of" || words[words.length - 1] === "the")) {
    words.pop();
  }
  return { words, next: index };
}

function defaultUnitFor(foodName: string, stated: CanonicalFoodUnit | null): CanonicalFoodUnit | null {
  if (stated) return stated;
  if (SLICE_FOODS.has(foodName) || foodName.endsWith(" toast") || foodName.endsWith(" bread")) return "slice";
  if (COUNTABLE_FOODS.has(foodName) || COUNTABLE_FOODS.has(foodName.split(" ").pop() ?? "")) return "whole";
  return null;
}

function isNonFoodPhrase(phrase: string): boolean {
  if (!phrase) return true;
  const tokens = phrase.split(/\s+/);
  return tokens.every((token) => NON_FOOD_TOKENS.has(token) || CONNECTORS.has(token) || FILLER_WORDS.has(token));
}

function splitContainerFilling(foodName: string): { filling: string; container: string } | null {
  const match = foodName.match(/^([a-z][a-z'-]*)\s+(sandwich|wrap|burger|roll)$/i);
  if (!match) return null;
  const descriptor = match[1]!.toLowerCase();
  if (KEEP_CONTAINER_BRANDS.has(descriptor)) return null;
  return { filling: descriptor, container: match[2]!.toLowerCase() };
}

function tryCompositeSandwich(mealText: string): ParsedFoodItem | null {
  const stripped = mealText.trim().replace(/^(?:a|an|the)\s+/, "");
  const match = stripped.match(/^(.+?)\s+(sandwiches|sandwich|wraps|wrap|burgers|burger|rolls|roll)$/i);
  if (!match) return null;
  const fillingText = match[1]!;
  if (new RegExp(`\\b(?:${QUANTITY_PATTERN})\\b`, "i").test(fillingText) && /\d|two|three|four|half/.test(fillingText)) {
    return null;
  }
  if (!/(?:,|\band\b)/.test(fillingText)) return null;
  const fillings = fillingText
    .split(/\s*(?:,|and|&)\s*|\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && word !== "and" && word !== "a" && word !== "an" && word !== "with");
  if (fillings.length < 2) return null;
  const container = match[2]!.replace(/es$/, "").replace(/s$/, "");
  return {
    originalFragment: mealText.trim(),
    foodName: container,
    brand: null,
    quantity: 1,
    unit: "whole",
    originalUnit: null,
    grams: null,
    preparation: "composite sandwich",
    modifiers: fillings,
    confidence: 0.55,
    assumptions: [`Composite ${container} with ${fillings.join(", ")}; ingredient amounts unknown`],
    qualifier: null,
  };
}

export function isolateMealText(text: string): {
  mealText: string;
  containerContext: string | null;
  mealDescription: string | null;
  triggered: boolean;
} {
  let working = text.replace(CORRECTION_PATTERN, " ");
  working = working.replace(GLUCOSE_CLAUSE_PATTERN, " ");
  working = working.replace(/\b(?:i(?:'m|\s+am)\s+)?(?:at|sitting\s+at)\s+\d+(?:\.\d+)?\s*(?:mmol(?:\s*\/\s*l)?|mg\s*\/\s*dl)\b/gi, " ");
  working = working.replace(/\b\d+(?:\.\d+)?\s*(?:mmol(?:\s*\/\s*l)?|mg\s*\/\s*dl)\b/gi, " ");
  working = working.replace(/\b(?:log(?:ging)?|record(?:ing)?)\s+(?:my\s+)?(?:glucose|bgl|bsl|sugar)\b/gi, " ");
  working = working.replace(INSULIN_CLAUSE_PATTERN, " ");
  working = working.replace(INSULIN_NO_AMOUNT_PATTERN, " ");
  working = working.replace(/\s+/g, " ").trim();

  let containerContext: string | null = null;
  let mealDescription: string | null = null;
  let triggered = false;

  const containerOf = working.match(CONTAINER_OF_PATTERN);
  if (containerOf && containerOf.index !== undefined) {
    containerContext = containerOf[1]!.toLowerCase();
    mealDescription = containerContext;
    working = working.slice(containerOf.index + containerOf[0].length).trim();
    triggered = true;
  } else {
    const trigger = working.match(MEAL_TRIGGER_PATTERN);
    if (trigger && trigger.index !== undefined) {
      working = working.slice(trigger.index + trigger[0].length).trim();
      triggered = true;
    }
  }

  working = working.replace(FILLER_LEAD_IN_PATTERN, "");
  working = working.replace(/^(?:and|then|,)\s+/i, "");
  working = working.replace(/\s+/g, " ").trim();

  return { mealText: working, containerContext, mealDescription, triggered };
}

function buildItem(args: {
  originalFragment: string;
  foodName: string;
  quantity: number | null;
  unit: CanonicalFoodUnit | null;
  originalUnit: string | null;
  qualifier: string | null;
  modifiers: string[];
  preparation: string | null;
  brand: string | null;
  grams: number | null;
  assumptions: string[];
  confidence: number;
}): ParsedFoodItem {
  const foodName = canonicalizeFoodName(args.foodName);
  const assumptions = [...args.assumptions];
  let unit = defaultUnitFor(foodName, args.unit);
  if (!args.unit && unit === "slice" && args.quantity !== null) {
    assumptions.push(`Assumed ${unit} for ${foodName}`);
  }
  if (!args.unit && unit === "whole" && args.quantity !== null) {
    assumptions.push(`Assumed whole ${foodName}`);
  }
  if (unit === "g" && args.quantity !== null) {
    return {
      ...args,
      foodName,
      unit,
      grams: args.quantity,
      assumptions,
    };
  }
  if (unit === "kg" && args.quantity !== null) {
    return {
      ...args,
      foodName,
      unit: "g",
      originalUnit: args.originalUnit ?? "kg",
      quantity: args.quantity * 1000,
      grams: args.quantity * 1000,
      assumptions,
    };
  }
  return {
    ...args,
    foodName,
    unit,
    assumptions,
  };
}

function parseItems(tokens: string[], containerContext: string | null): { items: ParsedFoodItem[]; detectedContainer: string | null } {
  const items: ParsedFoodItem[] = [];
  let detectedContainer = containerContext;
  let index = 0;

  while (index < tokens.length) {
    while (index < tokens.length && (CONNECTORS.has(tokens[index]!) || FILLER_WORDS.has(tokens[index]!))) {
      index += 1;
    }
    if (index >= tokens.length) break;

    const start = index;
    const modifiers: string[] = [];
    if (SIZE_WORDS.has(tokens[index]!)) {
      modifiers.push(tokens[index]!);
      index += 1;
    }

    const vague = tryVague(tokens, index);
    let quantity: number | null = null;
    let unitMatch: ReturnType<typeof matchUnit> = null;
    let qualifier: string | null = null;
    const assumptions: string[] = [];

    if (vague) {
      qualifier = vague.label;
      index += vague.length;
    } else {
      const qty = tryQuantity(tokens, index);
      if (qty) {
        quantity = qty.value;
        unitMatch = qty.unit;
        index += qty.length;
        if (tokens[index] === "x") index += 1;
      }
      if (!unitMatch && isUnitToken(tokens[index])) {
        unitMatch = matchUnit(tokens[index]!)!;
        index += 1;
      } else if (!qty && isUnitToken(tokens[index]) && (tokens[index + 1] === "of" || tokens[index + 1])) {
        unitMatch = matchUnit(tokens[index]!)!;
        quantity = 1;
        assumptions.push(`Assumed 1 ${unitMatch.canonical}`);
        index += 1;
      }
      if (tokens[index] === "of") index += 1;
      if ((tokens[index] === "a" || tokens[index] === "an") && isUnitToken(tokens[index + 1] ?? "")) {
        index += 1;
        if (!unitMatch) {
          unitMatch = matchUnit(tokens[index]!)!;
          index += 1;
        }
        if (tokens[index] === "of") index += 1;
      }
    }

    if (SIZE_WORDS.has(tokens[index] ?? "")) {
      modifiers.push(tokens[index]!);
      index += 1;
    }

    const food = collectFoodName(tokens, index);
    if (food.words.length === 0) {
      if (index === start) index += 1;
      else index = Math.max(index, start + 1);
      continue;
    }
    index = food.next;

    const rawFood = food.words.join(" ");
    if (isNonFoodPhrase(rawFood)) continue;

    const fragment = tokens.slice(start, index).join(" ").replace(/\s+,/g, ",");
    let foodName = rawFood;
    let preparation = containerContext ? `${containerContext} ingredient` : null;
    let brand: string | null = null;

    const containerSplit = splitContainerFilling(foodName);
    if (containerSplit && !KEEP_CONTAINER_BRANDS.has(containerSplit.filling)) {
      foodName = containerSplit.filling;
      preparation = containerSplit.container;
      detectedContainer = detectedContainer ?? containerSplit.container;
      const articleOnly = quantity === 1 && /^(?:a|an)\b/.test(fragment);
      if (articleOnly) quantity = null;
    }
    if (KEEP_CONTAINER_BRANDS.has(foodName.split(" ")[0] ?? "")) {
      brand = foodName.split(" ")[0] ?? null;
    }

    const articleOnly = quantity === 1 && /^(?:a|an)\b/.test(fragment) && !/\d/.test(fragment);
    if (articleOnly && /\b(?:sandwich|wrap|burger|roll)\b/.test(foodName)) {
      quantity = null;
    }

    if (quantity === null && !qualifier) {
      const canonicalName = canonicalizeFoodName(foodName);
      if (canonicalName === "flat white" || modifiers.includes("large") || modifiers.includes("medium") || modifiers.includes("small")) {
        quantity = 1;
        assumptions.push(`Assumed 1 ${canonicalName}`);
      }
    }

    items.push(
      buildItem({
        originalFragment: fragment,
        foodName,
        quantity,
        unit: unitMatch?.canonical ?? null,
        originalUnit: unitMatch?.original ?? null,
        qualifier,
        modifiers,
        preparation,
        brand,
        grams: unitMatch?.canonical === "g" && quantity !== null ? quantity : null,
        assumptions,
        confidence: qualifier ? 0.45 : quantity !== null ? 0.98 : 0.7,
      }),
    );
  }

  return { items, detectedContainer };
}

function extractLemmaHits(text: string): string[] {
  const lower = text.toLowerCase();
  return SIGNIFICANT_FOOD_LEMMAS.filter((lemma) => {
    const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
  });
}

export function validateCompleteness(originalText: string, mealText: string, items: readonly ParsedFoodItem[]): MealCompleteness {
  const source = (mealText || originalText).toLowerCase();
  const lemmas = extractLemmaHits(source);
  const accountedFragments: string[] = [];
  const missingFragments: string[] = [];

  for (const lemma of lemmas) {
    const accounted = items.some((item) => {
      const haystack = `${item.foodName} ${item.originalFragment} ${item.modifiers.join(" ")}`.toLowerCase();
      return haystack.includes(lemma) || lemma.includes(item.foodName);
    });
    if (accounted) accountedFragments.push(lemma);
    else missingFragments.push(lemma);
  }

  const quantityTokens = source.match(/\b(?:\d+(?:\.\d+)?|two|three|four|five|six|seven|eight|nine|ten|half|dozen)\b/g) ?? [];
  const boundQuantities = items.flatMap((item) => {
    const values: string[] = [];
    if (item.quantity !== null) values.push(String(item.quantity));
    if (item.quantity === 2) values.push("two");
    if (item.quantity === 0.5) values.push("half");
    if (item.unit === "g" && item.quantity !== null) values.push(String(item.quantity));
    return values;
  });
  for (const token of quantityTokens) {
    const numeric = tryNumericToken(token);
    const bound =
      boundQuantities.includes(token) ||
      (numeric !== null && items.some((item) => item.quantity === numeric || item.grams === numeric));
    if (!bound && !["one", "a"].includes(token)) {
      // Article-like numbers that belong to unparsed clinical leftover are ignored.
      if (!items.some((item) => item.originalFragment.includes(token))) {
        missingFragments.push(token);
      }
    }
  }

  return {
    valid: missingFragments.length === 0,
    accountedFragments,
    missingFragments,
  };
}

function confidenceGateFor(items: readonly ParsedFoodItem[], completeness: MealCompleteness): MealParseConfidenceGate {
  if (!completeness.valid || items.length === 0) return "low";
  const missingQuantity = items.some((item) => item.quantity === null && !item.qualifier);
  const hasAssumption = items.some((item) => item.assumptions.length > 0 || item.qualifier !== null);
  const lowItem = items.some((item) => item.confidence < 0.7);
  if (missingQuantity || lowItem) return "low";
  if (hasAssumption) return "medium";
  return "high";
}

function averageConfidence(items: readonly ParsedFoodItem[], gate: MealParseConfidenceGate): number {
  if (items.length === 0) return 0;
  const mean = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
  if (gate === "low") return Math.min(mean, 0.49);
  if (gate === "medium") return Math.min(mean, 0.8);
  return mean;
}

function looksLikeMeal(mealText: string, triggered: boolean): boolean {
  if (triggered) return true;
  if (extractLemmaHits(mealText).length > 0) return true;
  return /\b(?:toast|bread|milk|coffee|rice|pasta|juice|yogurt|yoghurt|sandwich|banana|nana|egg|cereal|biscuit|cookie|weet|coke|chips|steak|avocado|peanut|flat\s+white)\b/i.test(
    mealText,
  );
}

export function parseMeal(originalText: string, options?: { parseSource?: "deterministic" | "llm" }): ParsedMeal {
  const isolated = isolateMealText(originalText);
  let { mealText, containerContext, mealDescription, triggered } = isolated;
  const warnings: string[] = [];
  const unresolvedFragments: string[] = [];

  if (!mealText || !looksLikeMeal(mealText, triggered)) {
    const empty: ParsedMeal = {
      originalText,
      mealText: looksLikeMeal(mealText, triggered) ? mealText : "",
      mealDescription,
      items: [],
      parseConfidence: 0,
      confidenceGate: "low",
      unresolvedFragments: [],
      warnings,
      completeness: { valid: true, accountedFragments: [], missingFragments: [] },
      containerContext,
      parseSource: options?.parseSource ?? "deterministic",
    };
    return empty;
  }

  const composite = tryCompositeSandwich(mealText);
  const tokens = tokenize(mealText);
  const parsed = parseItems(tokens, containerContext);
  let items = composite && !CONTAINER_OF_PATTERN.test(originalText) && itemsWouldBeSingleSandwich(mealText)
    ? [composite]
    : parsed.items;
  containerContext = containerContext ?? parsed.detectedContainer;

  if (composite && items.length === 1 && items[0]!.foodName !== "sandwich" && /sandwich/.test(mealText) && /(?:and|,)/.test(mealText) && !/\b(?:two|2|slices?|grams?)\b/i.test(mealText)) {
    items = [composite];
  }

  items = items.filter((item) => item.foodName.length > 0);
  const completeness = validateCompleteness(originalText, mealText, items);
  unresolvedFragments.push(...completeness.missingFragments);
  if (!completeness.valid) {
    warnings.push("Not every significant food phrase in the original text was accounted for.");
  }
  const confidenceGate = confidenceGateFor(items, completeness);
  if (confidenceGate === "low") {
    warnings.push("I couldn't confidently interpret all of that meal.");
  }

  return {
    originalText,
    mealText,
    mealDescription,
    items,
    parseConfidence: averageConfidence(items, confidenceGate),
    confidenceGate,
    unresolvedFragments,
    warnings,
    completeness,
    containerContext,
    parseSource: options?.parseSource ?? "deterministic",
  };
}

function itemsWouldBeSingleSandwich(mealText: string): boolean {
  return /^(?:a|an|the)?\s*.+\s+(?:sandwich|wrap|burger|roll)s?\s*$/i.test(mealText.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const CANONICAL_UNITS = new Set<CanonicalFoodUnit>([
  "g",
  "kg",
  "ml",
  "l",
  "slice",
  "piece",
  "cup",
  "tablespoon",
  "teaspoon",
  "serving",
  "packet",
  "can",
  "bottle",
  "handful",
  "whole",
  "item",
]);

function asCanonicalUnit(value: unknown): CanonicalFoodUnit | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  const mapped = matchUnit(lower)?.canonical ?? (CANONICAL_UNITS.has(lower as CanonicalFoodUnit) ? (lower as CanonicalFoodUnit) : null);
  return mapped;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Schema-validate untrusted structured-output (LLM) before it can enter
 * nutrition resolution. Malformed objects are rejected entirely.
 */
export function validateParsedMeal(input: unknown, originalText: string): ParsedMeal | null {
  if (!isRecord(input)) return null;
  const rawItems = input.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;

  const items: ParsedFoodItem[] = [];
  for (const raw of rawItems) {
    if (!isRecord(raw)) return null;
    const foodName = asString(raw.foodName ?? raw.food_text ?? raw.food);
    if (!foodName || !foodName.trim()) return null;
    const quantity = asNumber(raw.quantity) ?? null;
    const unit = asCanonicalUnit(raw.unit);
    const confidence = asNumber(raw.confidence) ?? 0.8;
    if (confidence < 0 || confidence > 1) return null;
    items.push(
      buildItem({
        originalFragment: asString(raw.originalFragment) ?? foodName,
        foodName: foodName.trim(),
        quantity,
        unit,
        originalUnit: asString(raw.originalUnit) ?? asString(raw.unit),
        qualifier: asString(raw.qualifier),
        modifiers: asStringArray(raw.modifiers),
        preparation: asString(raw.preparation),
        brand: asString(raw.brand),
        grams: asNumber(raw.grams),
        assumptions: asStringArray(raw.assumptions),
        confidence,
      }),
    );
  }

  const mealText = asString(input.mealText) ?? isolateMealText(originalText).mealText;
  const completeness = validateCompleteness(originalText, mealText, items);
  const confidenceGate = confidenceGateFor(items, completeness);
  return {
    originalText,
    mealText,
    mealDescription: asString(input.mealDescription),
    items,
    parseConfidence: asNumber(input.parseConfidence) ?? averageConfidence(items, confidenceGate),
    confidenceGate,
    unresolvedFragments: asStringArray(input.unresolvedFragments),
    warnings: asStringArray(input.warnings),
    completeness,
    containerContext: asString(input.containerContext),
    parseSource: "llm",
  };
}

export function findItem(meal: ParsedMeal, matcher: (name: string) => boolean): ParsedFoodItem | undefined {
  return meal.items.find((item) => matcher(item.foodName) || matcher(item.originalFragment));
}
