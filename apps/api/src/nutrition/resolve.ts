import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FoodComponentExtraction } from "@diabetes-companion/natural-language";
import type { FoodSearchResult } from "@diabetes-companion/food-contracts";
import {
  AUTO_ACCEPT_CONFIDENCE,
  CONFIDENCE_BY_MATCH_TYPE,
  assumedPortionFromMeasure,
  emptyPanel,
  isStrongIdentityMatch,
  nameConfidence,
  pickCountableMeasure,
  scaleNutrients,
  type NutritionMealItem,
} from "@diabetes-companion/food-engine";
import { searchFoods } from "../food/search.js";
import { getMeasures } from "../food/measures.js";
import { calculateNutrition } from "../food/nutrition.js";
import type { NutritionCustomFood, NutritionRecipe, NutritionRepository, NutritionSavedMeal } from "./types.js";

export interface ResolveContext {
  readonly db: InstanceType<typeof Database>;
  readonly databaseSha256: string;
  readonly customFoods: readonly NutritionCustomFood[];
  readonly savedMeals: readonly NutritionSavedMeal[];
  readonly recipes: readonly NutritionRecipe[];
}

export interface CandidateMatch {
  readonly source: NutritionMealItem["identity"]["source"];
  readonly label: string;
  readonly brand: string | null;
  readonly confidence: number;
  readonly matchReason: string;
  readonly sourceDataset: string | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  readonly savedMealId: string | null;
  readonly recipeId: string | null;
}

function toItemBase(component: FoodComponentExtraction): Omit<NutritionMealItem, "identity" | "serving" | "nutrients" | "assumptions" | "matchConfidence" | "matchStatus" | "databaseSha256" | "sourceVersion"> {
  return {
    id: randomUUID(),
    originalFragment: component.rawSpan || component.phrase,
  };
}

function quantityGrams(component: FoodComponentExtraction): number | null {
  const quantity = component.quantity.value;
  if (quantity === null) return null;
  if (component.quantityKind === "GRAMS") {
    if (component.canonicalUnit === "kg") return quantity * 1000;
    return quantity;
  }
  return null;
}

function quantityMillilitres(component: FoodComponentExtraction): number | null {
  if (component.quantityKind !== "MILLILITRES" || component.quantity.value === null) return null;
  return component.quantity.value;
}

function unmatchedItem(component: FoodComponentExtraction, warnings: string[]): NutritionMealItem {
  warnings.push(`Could not resolve “${component.phrase}”.`);
  return {
    ...toItemBase(component),
    identity: {
      foodId: null,
      foodName: component.phrase,
      brand: component.brand,
      sourceDataset: null,
      sourceFoodId: null,
      customFoodId: null,
      savedMealId: null,
      recipeId: null,
      source: "UNRESOLVED",
    },
    serving: {
      servingId: null,
      servingLabel: null,
      quantity: component.quantity.value,
      unit: component.canonicalUnit ?? component.unit.value,
      grams: quantityGrams(component),
      millilitres: quantityMillilitres(component),
    },
    nutrients: emptyPanel(),
    assumptions: [...component.assumptions, "unresolved food — not included in totals"],
    matchConfidence: 0,
    matchStatus: "unmatched",
    databaseSha256: null,
    sourceVersion: null,
  };
}

function collectCandidates(
  component: FoodComponentExtraction,
  context: ResolveContext,
  searchResults: readonly FoodSearchResult[],
): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];
  for (const meal of context.savedMeals) {
    const confidence = nameConfidence(meal.name, component.phrase);
    if (confidence > 0) {
      candidates.push({
        source: "SAVED_MEAL",
        label: meal.name,
        brand: null,
        confidence,
        matchReason: confidence >= 0.9 ? "Matches a saved meal." : "Similar to a saved meal.",
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: null,
        savedMealId: meal.id,
        recipeId: null,
      });
    }
  }
  for (const recipe of context.recipes) {
    const confidence = nameConfidence(recipe.name, component.phrase);
    if (confidence > 0) {
      candidates.push({
        source: "RECIPE",
        label: recipe.name,
        brand: null,
        confidence,
        matchReason: confidence >= 0.9 ? "Matches a saved recipe." : "Similar to a saved recipe.",
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: null,
        savedMealId: null,
        recipeId: recipe.id,
      });
    }
  }
  for (const food of context.customFoods) {
    const confidence = nameConfidence(food.name, component.phrase);
    if (confidence > 0) {
      candidates.push({
        source: "CUSTOM",
        label: food.name,
        brand: food.brand,
        confidence,
        matchReason: confidence >= 0.9 ? "Matches your custom food." : "Similar to a custom food.",
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: food.id,
        savedMealId: null,
        recipeId: null,
      });
    }
  }
  const preferLiquid = component.quantityKind === "MILLILITRES";
  for (const result of searchResults) {
    let confidence: number = CONFIDENCE_BY_MATCH_TYPE[result.matchType];
    if (preferLiquid && result.hasMillilitreData) confidence = Math.min(0.99, confidence + 0.08);
    if (isStrongIdentityMatch(component.phrase, result.foodName)) confidence = Math.max(confidence, 0.9);
    candidates.push({
      source: result.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD",
      label: result.foodName,
      brand: null,
      confidence,
      matchReason: `${result.matchType.replaceAll("_", " ").toLowerCase()} match in the food database.`,
      sourceDataset: result.sourceDataset,
      sourceFoodId: result.sourceFoodId,
      customFoodId: null,
      savedMealId: null,
      recipeId: null,
    });
  }
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function cloneItem(item: NutritionMealItem, multiplier: number): NutritionMealItem {
  return {
    ...item,
    id: randomUUID(),
    nutrients: scaleNutrients(item.nutrients, multiplier, 1),
    serving: {
      ...item.serving,
      quantity: item.serving.quantity === null ? multiplier : item.serving.quantity * multiplier,
      grams: item.serving.grams === null ? null : item.serving.grams * multiplier,
      millilitres: item.serving.millilitres === null ? null : item.serving.millilitres * multiplier,
    },
  };
}

export function resolveFoodComponent(
  component: FoodComponentExtraction,
  context: ResolveContext,
  selected?: { sourceDataset?: string; sourceFoodId?: string; measureId?: string; customFoodId?: string },
): { item: NutritionMealItem; expanded: NutritionMealItem[]; candidates: CandidateMatch[] } {
  const warnings: string[] = [];
  const search = searchFoods(context.db, { query: component.phrase, pageSize: 8 });
  const candidates = collectCandidates(component, context, search.results);

  const forced =
    selected?.customFoodId
      ? candidates.find((candidate) => candidate.customFoodId === selected.customFoodId)
      : selected?.sourceFoodId
        ? candidates.find((candidate) => candidate.sourceFoodId === selected.sourceFoodId) ?? {
            source: (selected.sourceDataset === "AFCD_RELEASE_3" ? "AFCD" : "AUSNUT") as CandidateMatch["source"],
            label: component.phrase,
            brand: null,
            confidence: 1,
            matchReason: "Selected by the user.",
            sourceDataset: selected.sourceDataset ?? null,
            sourceFoodId: selected.sourceFoodId ?? null,
            customFoodId: null,
            savedMealId: null,
            recipeId: null,
          }
        : null;

  const bestMatch = forced ?? candidates[0] ?? null;
  const quantity = component.quantity.value;

  if (!bestMatch) {
    return { item: unmatchedItem(component, warnings), expanded: [], candidates };
  }

  const accepted = bestMatch.confidence >= AUTO_ACCEPT_CONFIDENCE || isStrongIdentityMatch(component.phrase, bestMatch.label) || Boolean(forced);
  if (!accepted) {
    const item: NutritionMealItem = {
      ...toItemBase(component),
      identity: {
        foodId: bestMatch.sourceFoodId ?? bestMatch.customFoodId ?? bestMatch.savedMealId,
        foodName: bestMatch.label,
        brand: bestMatch.brand,
        sourceDataset: bestMatch.sourceDataset,
        sourceFoodId: bestMatch.sourceFoodId,
        customFoodId: bestMatch.customFoodId,
        savedMealId: bestMatch.savedMealId,
        recipeId: bestMatch.recipeId,
        source: bestMatch.source,
      },
      serving: {
        servingId: null,
        servingLabel: null,
        quantity,
        unit: component.canonicalUnit ?? component.unit.value,
        grams: quantityGrams(component),
        millilitres: quantityMillilitres(component),
      },
      nutrients: emptyPanel(),
      assumptions: [...component.assumptions, "match needs confirmation"],
      matchConfidence: bestMatch.confidence,
      matchStatus: "ambiguous",
      databaseSha256: context.databaseSha256,
      sourceVersion: null,
    };
    return { item, expanded: [], candidates };
  }

  if (bestMatch.source === "SAVED_MEAL" && bestMatch.savedMealId) {
    const meal = context.savedMeals.find((row) => row.id === bestMatch.savedMealId);
    const multiplier = quantity && quantity > 0 ? quantity : 1;
    const expanded = (meal?.items ?? []).map((row) => cloneItem(row, multiplier));
    const item: NutritionMealItem = {
      ...toItemBase(component),
      identity: {
        foodId: bestMatch.savedMealId,
        foodName: bestMatch.label,
        brand: null,
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: null,
        savedMealId: bestMatch.savedMealId,
        recipeId: null,
        source: "SAVED_MEAL",
      },
      serving: {
        servingId: null,
        servingLabel: "saved meal",
        quantity: multiplier,
        unit: "serving",
        grams: null,
        millilitres: null,
      },
      nutrients: meal ? scaleNutrients(meal.totals, multiplier, 1) : emptyPanel(),
      assumptions: [`expanded saved meal “${bestMatch.label}”`],
      matchConfidence: bestMatch.confidence,
      matchStatus: "resolved",
      databaseSha256: context.databaseSha256,
      sourceVersion: null,
    };
    return { item, expanded, candidates };
  }

  if (bestMatch.source === "RECIPE" && bestMatch.recipeId) {
    const recipe = context.recipes.find((row) => row.id === bestMatch.recipeId);
    const multiplier = quantity && quantity > 0 ? quantity : 1;
    const item: NutritionMealItem = {
      ...toItemBase(component),
      identity: {
        foodId: bestMatch.recipeId,
        foodName: bestMatch.label,
        brand: null,
        sourceDataset: null,
        sourceFoodId: null,
        customFoodId: null,
        savedMealId: null,
        recipeId: bestMatch.recipeId,
        source: "RECIPE",
      },
      serving: {
        servingId: null,
        servingLabel: "recipe serving",
        quantity: multiplier,
        unit: "serving",
        grams: recipe?.totalWeightGrams === null || recipe?.totalWeightGrams === undefined ? null : (recipe.totalWeightGrams / recipe.servings) * multiplier,
        millilitres: null,
      },
      nutrients: recipe ? scaleNutrients(recipe.nutrientsPerServing, multiplier, 1) : emptyPanel(),
      assumptions: [`${multiplier} serve${multiplier === 1 ? "" : "s"} of “${bestMatch.label}”`],
      matchConfidence: bestMatch.confidence,
      matchStatus: recipe ? "resolved" : "unmatched",
      databaseSha256: context.databaseSha256,
      sourceVersion: null,
    };
    return { item, expanded: [], candidates };
  }

  if (bestMatch.source === "CUSTOM" && bestMatch.customFoodId) {
    const food = context.customFoods.find((row) => row.id === bestMatch.customFoodId);
    if (!food) return { item: unmatchedItem(component, warnings), expanded: [], candidates };
    const grams =
      quantityGrams(component) ??
      (component.quantityKind === "COUNT" && quantity !== null && food.servingGrams ? quantity * food.servingGrams : null);
    if (grams === null) {
      return {
        item: {
          ...toItemBase(component),
          identity: {
            foodId: food.id,
            foodName: food.name,
            brand: food.brand,
            sourceDataset: null,
            sourceFoodId: null,
            customFoodId: food.id,
            savedMealId: null,
            recipeId: null,
            source: "CUSTOM",
          },
          serving: {
            servingId: null,
            servingLabel: food.servingDescription,
            quantity,
            unit: component.canonicalUnit ?? component.unit.value,
            grams: null,
            millilitres: null,
          },
          nutrients: emptyPanel(),
          assumptions: [...component.assumptions, "quantity needed"],
          matchConfidence: bestMatch.confidence,
          matchStatus: "needs_portion",
          databaseSha256: null,
          sourceVersion: null,
        },
        expanded: [],
        candidates,
      };
    }
    return {
      item: {
        ...toItemBase(component),
        identity: {
          foodId: food.id,
          foodName: food.name,
          brand: food.brand,
          sourceDataset: null,
          sourceFoodId: null,
          customFoodId: food.id,
          savedMealId: null,
          recipeId: null,
          source: "CUSTOM",
        },
        serving: {
          servingId: null,
          servingLabel: food.servingDescription,
          quantity,
          unit: component.canonicalUnit ?? "g",
          grams,
          millilitres: null,
        },
        nutrients: scaleNutrients(food.nutrientsPer100g, grams),
        assumptions: component.assumptions,
        matchConfidence: bestMatch.confidence,
        matchStatus: "resolved",
        databaseSha256: null,
        sourceVersion: "custom",
      },
      expanded: [],
      candidates,
    };
  }

  if (!bestMatch.sourceDataset || !bestMatch.sourceFoodId) {
    return { item: unmatchedItem(component, warnings), expanded: [], candidates };
  }

  const sourceDataset = bestMatch.sourceDataset === "AFCD_RELEASE_3" ? "AFCD_RELEASE_3" : "AUSNUT_2023";
  const grams = quantityGrams(component);
  const millilitres = quantityMillilitres(component);

  try {
    if (grams !== null) {
      const result = calculateNutrition(context.db, { kind: "GRAMS", sourceDataset, sourceFoodId: bestMatch.sourceFoodId, grams }, context.databaseSha256);
      return {
        item: {
          ...toItemBase(component),
          identity: {
            foodId: `${sourceDataset}:${bestMatch.sourceFoodId}`,
            foodName: result.foodName,
            brand: null,
            sourceDataset,
            sourceFoodId: bestMatch.sourceFoodId,
            customFoodId: null,
            savedMealId: null,
            recipeId: null,
            source: bestMatch.source,
          },
          serving: {
            servingId: null,
            servingLabel: result.portionDescription,
            quantity: grams,
            unit: "g",
            grams: result.portionGrams,
            millilitres: null,
          },
          nutrients: result.nutrients,
          assumptions: component.assumptions,
          matchConfidence: bestMatch.confidence,
          matchStatus: "resolved",
          databaseSha256: context.databaseSha256,
          sourceVersion: result.provenance.sourceObject,
        },
        expanded: [],
        candidates,
      };
    }

    if (millilitres !== null) {
      const liquidMatch =
        candidates.find((candidate) => candidate.source === "AFCD" && candidate.sourceFoodId) ??
        (bestMatch.source === "AFCD" ? bestMatch : null);
      if (!liquidMatch?.sourceFoodId) {
        return {
          item: {
            ...toItemBase(component),
            identity: {
              foodId: bestMatch.sourceFoodId,
              foodName: bestMatch.label,
              brand: null,
              sourceDataset: bestMatch.sourceDataset,
              sourceFoodId: bestMatch.sourceFoodId,
              customFoodId: null,
              savedMealId: null,
              recipeId: null,
              source: bestMatch.source,
            },
            serving: {
              servingId: null,
              servingLabel: null,
              quantity: millilitres,
              unit: "ml",
              grams: null,
              millilitres,
            },
            nutrients: emptyPanel(),
            assumptions: [...component.assumptions, "millilitre calculation needs an AFCD liquid match"],
            matchConfidence: bestMatch.confidence,
            matchStatus: "needs_portion",
            databaseSha256: context.databaseSha256,
            sourceVersion: null,
          },
          expanded: [],
          candidates,
        };
      }
      const result = calculateNutrition(
        context.db,
        { kind: "MILLILITRES", sourceDataset: "AFCD_RELEASE_3", sourceFoodId: liquidMatch.sourceFoodId, millilitres },
        context.databaseSha256,
      );
      return {
        item: {
          ...toItemBase(component),
          identity: {
            foodId: `AFCD_RELEASE_3:${liquidMatch.sourceFoodId}`,
            foodName: result.foodName,
            brand: null,
            sourceDataset: "AFCD_RELEASE_3",
            sourceFoodId: liquidMatch.sourceFoodId,
            customFoodId: null,
            savedMealId: null,
            recipeId: null,
            source: "AFCD",
          },
          serving: {
            servingId: null,
            servingLabel: result.portionDescription,
            quantity: millilitres,
            unit: "ml",
            grams: null,
            millilitres: result.portionMillilitres,
          },
          nutrients: result.nutrients,
          assumptions: component.assumptions,
          matchConfidence: bestMatch.confidence,
          matchStatus: "resolved",
          databaseSha256: context.databaseSha256,
          sourceVersion: result.provenance.sourceObject,
        },
        expanded: [],
        candidates,
      };
    }

    if ((component.quantityKind === "COUNT" || component.quantityKind === "SERVING") && quantity !== null) {
      const measures = getMeasures(context.db, sourceDataset, bestMatch.sourceFoodId);
      const selectedMeasure = selected?.measureId
        ? measures.find((measure) => measure.measureId === selected.measureId)
        : pickCountableMeasure(measures, component.canonicalUnit ?? component.unit.value);
      if (selectedMeasure && selectedMeasure.gramAmount !== null) {
        const result = calculateNutrition(
          context.db,
          {
            kind: "MEASURE",
            sourceDataset,
            sourceFoodId: bestMatch.sourceFoodId,
            measureId: selectedMeasure.measureId,
            measureMultiplier: quantity,
          },
          context.databaseSha256,
        );
        const assumed = assumedPortionFromMeasure(selectedMeasure.measureDescription, component.canonicalUnit ?? component.unit.value);
        return {
          item: {
            ...toItemBase(component),
            identity: {
              foodId: `${sourceDataset}:${bestMatch.sourceFoodId}`,
              foodName: result.foodName,
              brand: null,
              sourceDataset,
              sourceFoodId: bestMatch.sourceFoodId,
              customFoodId: null,
              savedMealId: null,
              recipeId: null,
              source: bestMatch.source,
            },
            serving: {
              servingId: selectedMeasure.measureId,
              servingLabel: selectedMeasure.measureDescription,
              quantity,
              unit: component.canonicalUnit ?? component.unit.value,
              grams: result.portionGrams,
              millilitres: result.portionMillilitres,
            },
            nutrients: result.nutrients,
            assumptions: [...component.assumptions, ...(assumed ? [assumed] : [])],
            matchConfidence: bestMatch.confidence,
            matchStatus: "resolved",
            databaseSha256: context.databaseSha256,
            sourceVersion: result.provenance.sourceObject,
          },
          expanded: [],
          candidates,
        };
      }
    }
  } catch {
    // Fall through to needs_portion / unmatched rather than inventing nutrients.
  }

  if (quantity === null) {
    return {
      item: {
        ...toItemBase(component),
        identity: {
          foodId: `${sourceDataset}:${bestMatch.sourceFoodId}`,
          foodName: bestMatch.label,
          brand: null,
          sourceDataset,
          sourceFoodId: bestMatch.sourceFoodId,
          customFoodId: null,
          savedMealId: null,
          recipeId: null,
          source: bestMatch.source,
        },
        serving: {
          servingId: null,
          servingLabel: null,
          quantity: null,
          unit: component.canonicalUnit ?? component.unit.value,
          grams: null,
          millilitres: null,
        },
        nutrients: emptyPanel(),
        assumptions: [...component.assumptions, "quantity not stated"],
        matchConfidence: bestMatch.confidence,
        matchStatus: "needs_portion",
        databaseSha256: context.databaseSha256,
        sourceVersion: null,
      },
      expanded: [],
      candidates,
    };
  }

  return {
    item: {
      ...toItemBase(component),
      identity: {
        foodId: `${sourceDataset}:${bestMatch.sourceFoodId}`,
        foodName: bestMatch.label,
        brand: null,
        sourceDataset,
        sourceFoodId: bestMatch.sourceFoodId,
        customFoodId: null,
        savedMealId: null,
        recipeId: null,
        source: bestMatch.source,
      },
      serving: {
        servingId: null,
        servingLabel: null,
        quantity,
        unit: component.canonicalUnit ?? component.unit.value,
        grams: null,
        millilitres: millilitres,
      },
      nutrients: emptyPanel(),
      assumptions: [...component.assumptions, "portion could not be resolved automatically"],
      matchConfidence: bestMatch.confidence,
      matchStatus: "needs_portion",
      databaseSha256: context.databaseSha256,
      sourceVersion: null,
    },
    expanded: [],
    candidates,
  };
}

export async function loadResolveContext(userId: string, db: InstanceType<typeof Database>, databaseSha256: string, repo: NutritionRepository): Promise<ResolveContext> {
  const [customFoods, savedMeals, recipes] = await Promise.all([repo.listCustomFoods(userId), repo.listSavedMeals(userId), repo.listRecipes(userId)]);
  return { db, databaseSha256, customFoods, savedMeals, recipes };
}
