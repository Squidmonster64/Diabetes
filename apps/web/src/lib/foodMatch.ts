import { api } from "./apiClient.js";
import type { CustomFoodRecord, FoodMeasure, FoodSearchResult } from "@diabetes-companion/food-contracts";
import type { FoodComponentExtraction } from "@diabetes-companion/natural-language";

/**
 * Resolves a natural-language food/drink component (a phrase plus an
 * optional quantity) against the app's existing food sources - the
 * patient's own custom foods, and the AUSNUT/AFCD search index - and, only
 * when a single match is confident enough and a usable quantity has been
 * stated, computes a carbohydrate total via the existing server-side
 * calculation endpoints.
 *
 * This module never invents a match, never guesses a quantity, and never
 * exposes a raw database row - callers only ever see a small reviewable
 * candidate shape (name, brand, confidence, why-this-match reason) per the
 * food-contracts boundary (packages/food-contracts/src/index.ts header
 * comment): only a confirmed numeric carbohydrate figure may ever reach the
 * bolus module, and only after the user has reviewed it here.
 */

export type FoodMatchSource = "CUSTOM" | "AUSNUT" | "AFCD" | "BRANDED_OFFICIAL";

export interface FoodMatchCandidate {
  readonly source: FoodMatchSource;
  /** The short, canonical food name - what's shown as the primary match, matching the convention used everywhere else in the app (e.g. FoodResultsScreen). */
  readonly label: string;
  /** The longer database description, if any and if it differs from the label - supplementary detail only, never the primary label. */
  readonly description: string | null;
  readonly brand: string | null;
  readonly confidence: number;
  readonly matchReason: string;
  readonly sourceDataset: string | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  /** Official publisher page or document when the user explicitly selected a branded-menu item. */
  readonly sourceUrl?: string | null;
  readonly sourceVersion?: string | null;
}

export type FoodMatchStatus = "resolved" | "ambiguous" | "unmatched";

export interface ServingMeasureOption {
  readonly measureId: string;
  readonly label: string;
  readonly quantity: number;
  readonly gramAmount: number | null;
  readonly volumeMillilitres: number | null;
}

export interface ResolvedFoodComponent {
  readonly component: FoodComponentExtraction;
  readonly matchStatus: FoodMatchStatus;
  readonly bestMatch: FoodMatchCandidate | null;
  /** Up to two further candidates, shown only when the best match isn't confident enough to auto-accept. */
  readonly alternates: readonly FoodMatchCandidate[];
  /** Null until a quantity has been confirmed and mapped onto this match's carbohydrate data. */
  readonly carbohydrateGrams: number | null;
  /** Selectable database measures for a spoken serving phrase; never a guessed default. */
  readonly servingMeasures: readonly ServingMeasureOption[];
  /** True whenever this component still needs the existing manual portion-selection screen. */
  readonly requiresManualPortion: boolean;
}

/** Confidence tiers for the existing full-text-search match classification - fixed, not learned. */
const CONFIDENCE_BY_MATCH_TYPE: Record<FoodSearchResult["matchType"], number> = {
  EXACT: 0.95,
  WHOLE_WORD: 0.85,
  PREFIX: 0.7,
  TOKEN: 0.55,
  SUBSTRING: 0.4,
};

/**
 * Only an exact or whole-word database match may proceed as a provisional
 * candidate. Prefix, token, and substring matches are near-misses: surface
 * them for a quick user choice rather than silently using their carbohydrates.
 */
const AUTO_ACCEPT_CONFIDENCE = 0.85;

/**
 * AUSNUT records a "1 density" household measure on almost every food -
 * a grams-per-millilitre density coefficient for volume conversions, not a
 * real single-item portion (its gram_amount is typically well under 1g).
 * It also has quantity === 1 like a genuine "1 slice"/"1 biscuit" measure,
 * so it must be explicitly excluded before picking a per-unit measure for
 * a COUNT quantity, or a food's true per-slice/per-item weight gets
 * replaced by this coefficient and the calculated carbohydrate ends up
 * roughly 100x too small.
 */
const DENSITY_MEASURE_PATTERN = /density/i;
const COUNTABLE_MEASURE_HINT = /\b(slice|piece|biscuit|item|roll|unit|each|bar|disc|round|rasher)\b/i;

function customFoodConfidence(food: CustomFoodRecord, phrase: string): number {
  const name = food.name.trim().toLowerCase();
  const query = phrase.trim().toLowerCase();
  if (!query) return 0;
  if (name === query) return 0.95;
  if (name.includes(query) || query.includes(name)) return 0.65;
  return 0;
}

export interface FoodMatchDependencies {
  searchFoods: typeof api.searchFoods;
  listCustomFoods: typeof api.listCustomFoods;
  getMeasures: typeof api.getMeasures;
  calculateCarbohydrate: typeof api.calculateCarbohydrate;
  calculateCustomFoodCarbohydrate: typeof api.calculateCustomFoodCarbohydrate;
}

const defaultDependencies: FoodMatchDependencies = {
  searchFoods: api.searchFoods,
  listCustomFoods: api.listCustomFoods,
  getMeasures: api.getMeasures,
  calculateCarbohydrate: api.calculateCarbohydrate,
  calculateCustomFoodCarbohydrate: api.calculateCustomFoodCarbohydrate,
};

function toServingMeasureOptions(measures: readonly FoodMeasure[]): ServingMeasureOption[] {
  return measures
    .filter((measure) => !DENSITY_MEASURE_PATTERN.test(measure.measureDescription) && (measure.gramAmount !== null || measure.volumeMillilitres !== null))
    .map((measure) => ({
      measureId: measure.measureId,
      label: measure.measureDescription,
      quantity: measure.quantity,
      gramAmount: measure.gramAmount,
      volumeMillilitres: measure.volumeMillilitres,
    }));
}

async function computeCarbohydrate(
  component: FoodComponentExtraction,
  bestMatch: FoodMatchCandidate,
  customFoods: readonly CustomFoodRecord[],
  deps: FoodMatchDependencies,
  selectedServingMeasureId: string | null,
): Promise<{ carbohydrateGrams: number | null; requiresManualPortion: boolean; servingMeasures: readonly ServingMeasureOption[] }> {
  if (!component.quantityNeededForCalculation) {
    // A negligible-carbohydrate food with no stated quantity at all (e.g. "ham") -
    // its amount would not materially change the total, so it contributes zero
    // rather than the app guessing a portion size.
    return { carbohydrateGrams: 0, requiresManualPortion: false, servingMeasures: [] };
  }

  const quantity = component.quantity.value;
  if (quantity === null) return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };

  try {
    if (bestMatch.source === "CUSTOM") {
      const food = customFoods.find((candidate) => candidate.id === bestMatch.customFoodId);
      if (!food) return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };

      if (component.quantityKind === "GRAMS") {
        const result = await deps.calculateCustomFoodCarbohydrate(food.id, quantity);
        return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures: [] };
      }
      if (component.quantityKind === "COUNT" && food.servingGrams) {
        const grams = Number(food.servingGrams) * quantity;
        const result = await deps.calculateCustomFoodCarbohydrate(food.id, grams);
        return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures: [] };
      }
      return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };
    }

    if (!bestMatch.sourceDataset || !bestMatch.sourceFoodId) {
      return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };
    }

    if (component.quantityKind === "SERVING") {
      const { measures } = await deps.getMeasures(bestMatch.sourceDataset, bestMatch.sourceFoodId);
      const servingMeasures = toServingMeasureOptions(measures);
      const selectedMeasure = selectedServingMeasureId ? servingMeasures.find((measure) => measure.measureId === selectedServingMeasureId) : null;
      if (!selectedMeasure) return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures };
      const result = await deps.calculateCarbohydrate({
        sourceDataset: bestMatch.sourceDataset,
        sourceFoodId: bestMatch.sourceFoodId,
        kind: "MEASURE",
        measureId: selectedMeasure.measureId,
        measureMultiplier: quantity,
      });
      return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures };
    }

    if (component.quantityKind === "GRAMS") {
      const result = await deps.calculateCarbohydrate({
        sourceDataset: bestMatch.sourceDataset,
        sourceFoodId: bestMatch.sourceFoodId,
        kind: "GRAMS",
        grams: quantity,
      });
      return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures: [] };
    }

    if (component.quantityKind === "MILLILITRES") {
      const result = await deps.calculateCarbohydrate({
        sourceDataset: bestMatch.sourceDataset,
        sourceFoodId: bestMatch.sourceFoodId,
        kind: "MILLILITRES",
        millilitres: quantity,
      });
      return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures: [] };
    }

    if (component.quantityKind === "COUNT") {
      const { measures } = await deps.getMeasures(bestMatch.sourceDataset, bestMatch.sourceFoodId);
      const quantityOneMeasures = measures.filter(
        (measure) => measure.quantity === 1 && measure.gramAmount !== null && !DENSITY_MEASURE_PATTERN.test(measure.measureDescription),
      );
      const perUnitMeasure =
        quantityOneMeasures.find((measure) => COUNTABLE_MEASURE_HINT.test(measure.measureDescription)) ??
        quantityOneMeasures[0] ??
        null;
      if (perUnitMeasure) {
        const result = await deps.calculateCarbohydrate({
          sourceDataset: bestMatch.sourceDataset,
          sourceFoodId: bestMatch.sourceFoodId,
          kind: "MEASURE",
          measureId: perUnitMeasure.measureId,
          measureMultiplier: quantity,
        });
        return { carbohydrateGrams: result.carbohydrateGrams, requiresManualPortion: false, servingMeasures: [] };
      }
    }

    return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };
  } catch {
    // Any calculation failure (e.g. no carbohydrate data for this food) falls
    // back to the existing manual portion-selection screen rather than
    // silently reporting zero or a guessed value.
    return { carbohydrateGrams: null, requiresManualPortion: true, servingMeasures: [] };
  }
}

/**
 * Resolves one extracted food/drink component against custom foods and the
 * AUSNUT/AFCD search index. Never called for a component the user hasn't
 * been shown yet - this only prepares candidates and, where safe, a
 * carbohydrate figure for the review screen to display and the user to
 * confirm or change.
 */
export async function resolveFoodComponent(
  component: FoodComponentExtraction,
  deps: FoodMatchDependencies = defaultDependencies,
  selectedServingMeasureId: string | null = null,
): Promise<ResolvedFoodComponent> {
  // A condiment/protein explicitly classified as negligible does not need a
  // database match or an invented portion to contribute zero carbohydrate.
  // This prevents phrases such as "some chipotle mayo" from turning into an
  // unrelated food-search failure and unnecessary review question.
  if (!component.quantityNeededForCalculation) {
    return { component, matchStatus: "resolved", bestMatch: null, alternates: [], carbohydrateGrams: 0, servingMeasures: [], requiresManualPortion: false };
  }

  const [searchResponse, customFoodsResponse] = await Promise.all([
    deps.searchFoods(component.phrase).catch(() => ({ results: [] as FoodSearchResult[], totalMatches: 0 })),
    deps.listCustomFoods().catch(() => ({ foods: [] as CustomFoodRecord[] })),
  ]);

  const candidates: FoodMatchCandidate[] = [];

  for (const food of customFoodsResponse.foods) {
    const confidence = customFoodConfidence(food, component.phrase);
    if (confidence > 0) {
      candidates.push({
        source: "CUSTOM",
        label: food.name,
        description: null,
        brand: food.brand,
        confidence,
        matchReason:
          confidence >= 0.9 ? "Matches your saved custom food exactly." : "Similar to one of your saved custom foods.",
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: food.id,
        sourceUrl: null,
        sourceVersion: null,
      });
    }
  }

  for (const result of searchResponse.results) {
    const datasetLabel = result.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD";
    candidates.push({
      source: datasetLabel,
      label: result.foodName,
      description: result.foodDescription && result.foodDescription !== result.foodName ? result.foodDescription : null,
      brand: null,
      confidence: CONFIDENCE_BY_MATCH_TYPE[result.matchType],
      matchReason: `${result.matchType.replaceAll("_", " ").toLowerCase()} match in the ${datasetLabel} food database.`,
      sourceDataset: result.sourceDataset,
      sourceFoodId: result.sourceFoodId,
      customFoodId: null,
      sourceUrl: null,
      sourceVersion: null,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const bestMatch = candidates[0] ?? null;
  const alternates = candidates.slice(1, 3);

  if (!bestMatch) {
    return { component, matchStatus: "unmatched", bestMatch: null, alternates: [], carbohydrateGrams: null, servingMeasures: [], requiresManualPortion: true };
  }

  const matchStatus: FoodMatchStatus = bestMatch.confidence >= AUTO_ACCEPT_CONFIDENCE ? "resolved" : "ambiguous";

  if (matchStatus !== "resolved") {
    return { component, matchStatus, bestMatch, alternates, carbohydrateGrams: null, servingMeasures: [], requiresManualPortion: true };
  }

  const { carbohydrateGrams, requiresManualPortion, servingMeasures } = await computeCarbohydrate(
    component,
    bestMatch,
    customFoodsResponse.foods,
    deps,
    selectedServingMeasureId,
  );

  return { component, matchStatus, bestMatch, alternates, carbohydrateGrams, servingMeasures, requiresManualPortion };
}
