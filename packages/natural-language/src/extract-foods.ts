import { parseMeal } from "./parse-meal.js";
import type {
  CanonicalFoodUnit,
  ExtractedValue,
  FoodComponentExtraction,
  FoodComponentQuantityKind,
  MealExtraction,
  ParsedFoodItem,
  ParsedMeal,
} from "./types.js";

/**
 * Foods whose typical unquantified amount does not materially change a
 * carbohydrate calculation. Quantified mentions (e.g. "50 grams of butter")
 * still go through nutrition lookup. Unquantified mentions are kept in the
 * meal AST so they cannot silently disappear.
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

export function isNegligibleCarb(phrase: string): boolean {
  const normalisedPhrase = phrase.trim().toLowerCase();
  return NEGLIGIBLE_CARB_FOODS.some(
    (food) => normalisedPhrase === food || normalisedPhrase.endsWith(` ${food}`),
  );
}

function quantityKindFor(unit: CanonicalFoodUnit | null, qualifier: string | null, quantity: number | null): FoodComponentQuantityKind {
  if (unit === "g" || unit === "kg") return "GRAMS";
  if (unit === "ml" || unit === "l") return "MILLILITRES";
  if (unit === "serving") return "SERVING";
  if (qualifier && quantity === null) return "VAGUE";
  if (unit === "slice" || unit === "piece" || unit === "whole" || unit === "packet" || unit === "can" || unit === "bottle" || unit === "item") {
    return "COUNT";
  }
  if (unit === "cup" || unit === "tablespoon" || unit === "teaspoon" || unit === "handful") return "COUNT";
  if (quantity !== null && unit === null) return "COUNT";
  return "UNKNOWN";
}

function displayUnit(item: ParsedFoodItem): string | null {
  if (item.originalUnit) {
    if (item.unit === "slice" && item.quantity !== null && item.quantity !== 1) {
      return item.originalUnit.endsWith("s") ? item.originalUnit : `${item.originalUnit}`;
    }
    return item.originalUnit;
  }
  if (item.unit === "slice") return item.quantity !== null && item.quantity !== 1 ? "slices" : "slice";
  if (item.unit === "piece") return item.quantity !== null && item.quantity !== 1 ? "pieces" : "piece";
  return item.unit;
}

function toComponent(item: ParsedFoodItem): FoodComponentExtraction {
  const phrase = item.foodName;
  const quantityValue = item.unit === "l" && item.quantity !== null ? item.quantity * 1000 : item.quantity;
  const unitWord = item.unit === "l" ? "ml" : displayUnit(item);
  const quantityKind = quantityKindFor(item.unit === "l" ? "ml" : item.unit, item.qualifier, quantityValue);
  const negligible = isNegligibleCarb(phrase);
  const rawSpan = item.originalFragment;
  const hasAnyQuantitySignal = quantityValue !== null || item.qualifier !== null;

  const quantity: ExtractedValue<number> =
    quantityValue !== null
      ? { rawSpan, value: quantityValue, confidence: item.confidence, status: "provisional", requiresConfirmation: true }
      : { rawSpan: item.qualifier ?? "", value: null, confidence: item.qualifier ? 0.3 : 0, status: hasAnyQuantitySignal ? "requires_review" : "missing", requiresConfirmation: true };

  const unit: ExtractedValue<string> =
    unitWord !== null
      ? { rawSpan: item.originalUnit ?? unitWord, value: unitWord, confidence: item.confidence, status: "provisional", requiresConfirmation: true }
      : { rawSpan: "", value: null, confidence: 0, status: item.qualifier ? "requires_review" : "missing", requiresConfirmation: true };

  let matchStatus: FoodComponentExtraction["matchStatus"];
  let quantityNeededForCalculation: boolean;

  if (item.preparation === "composite sandwich" || item.assumptions.some((assumption) => /composite sandwich/i.test(assumption))) {
    matchStatus = "requires_review";
    quantityNeededForCalculation = true;
  } else if (quantityKind === "SERVING") {
    matchStatus = "requires_review";
    quantityNeededForCalculation = true;
  } else if (item.qualifier && !negligible) {
    matchStatus = "requires_review";
    quantityNeededForCalculation = true;
  } else if (quantityValue !== null) {
    matchStatus = "provisional";
    quantityNeededForCalculation = true;
  } else if (negligible) {
    matchStatus = "provisional";
    quantityNeededForCalculation = false;
  } else {
    matchStatus = "missing";
    quantityNeededForCalculation = true;
  }

  return {
    phrase,
    rawSpan,
    quantity,
    unit,
    quantityKind,
    selectedServingMeasureId: null,
    qualifier: item.qualifier,
    matchStatus,
    quantityNeededForCalculation,
    assumptions: item.assumptions,
    preparation: item.preparation,
    brand: item.brand,
    canonicalUnit: item.unit === "l" ? "ml" : item.unit,
    modifiers: item.modifiers,
  };
}

export function parsedMealToExtraction(parsed: ParsedMeal): MealExtraction | null {
  if (parsed.items.length === 0) return null;
  return {
    components: parsed.items.map(toComponent),
    containerContext: parsed.containerContext,
    parsedMeal: parsed,
  };
}

/**
 * Segments a meal description into individual food/drink components using
 * sequential quantity-binding, not fuzzy search of the whole sentence.
 * Returns null if the text contains no food language at all.
 */
export function extractFoods(text: string): MealExtraction | null {
  return parsedMealToExtraction(parseMeal(text));
}

export function extractFoodsFromParsedMeal(parsed: ParsedMeal): MealExtraction | null {
  return parsedMealToExtraction(parsed);
}
