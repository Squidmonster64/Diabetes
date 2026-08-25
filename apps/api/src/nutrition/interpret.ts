import {
  DUPLICATE_WINDOW_MS,
  FOOD_ENGINE_VERSION,
  PARSER_VERSION,
  PROMPT_VERSION,
  inferMealType,
  localHourFromInstant,
  nameConfidence,
  sumNutrients,
  type MealType,
  MEAL_TYPES,
  type NutritionMealItem,
  type NutritionMealLog,
} from "@diabetes-companion/food-engine";
import {
  extractFoodsFromParsedMeal,
  parseMeal,
  type ParsedMeal,
} from "@diabetes-companion/natural-language";
import { chooseMealParse, parseMealWithLanguageModel, interpretationModelVersion } from "../ai/interpretLanguage.js";
import type { AppState } from "../appState.js";
import { loadResolveContext, resolveFoodComponent, type CandidateMatch } from "./resolve.js";

export interface InterpretedMeal {
  readonly originalText: string;
  readonly transcription: string | null;
  readonly parsedMeal: ParsedMeal;
  readonly items: readonly NutritionMealItem[];
  readonly totals: NutritionMealLog["totals"];
  readonly unresolved: readonly string[];
  readonly warnings: readonly string[];
  readonly inferredMealType: ReturnType<typeof inferMealType>;
  readonly parseVersion: string;
  readonly promptVersion: string;
  readonly modelVersion: string | null;
  readonly engineVersion: string;
  readonly duplicateOf: { readonly id: string; readonly loggedAt: string } | null;
  readonly candidatesByItem: readonly (readonly CandidateMatch[])[];
}

async function parseWithOptionalLlm(text: string, state: AppState): Promise<ParsedMeal> {
  const deterministic = parseMeal(text);
  if (!state.config.openaiApiKey) return deterministic;
  try {
    const llm = await parseMealWithLanguageModel(text, state.config.openaiApiKey, {
      interpretationModel: state.config.openaiInterpretationModel,
    });
    return chooseMealParse(deterministic, llm);
  } catch {
    return deterministic;
  }
}

export async function interpretMealText(
  state: AppState,
  userId: string,
  input: {
    readonly text: string;
    readonly sourceType: "voice" | "text";
    readonly timezone: string;
    readonly loggedAt?: string;
    readonly mealType?: NutritionMealLog["mealType"];
  },
): Promise<InterpretedMeal> {
  const originalText = input.text.trim();
  const parsedMeal = await parseWithOptionalLlm(originalText, state);
  const extraction = extractFoodsFromParsedMeal(parsedMeal);
  const context = await loadResolveContext(userId, state.db, state.databaseSha256, state.nutritionRepository);

  const savedHit = context.savedMeals.find((meal) => nameConfidence(meal.name, originalText) >= 0.9);
  const items: NutritionMealItem[] = [];
  const candidatesByItem: CandidateMatch[][] = [];
  const warnings = [...parsedMeal.warnings];

  if (savedHit && (!extraction || extraction.components.length <= 1)) {
    for (const item of savedHit.items) {
      items.push({ ...item, id: crypto.randomUUID() });
    }
    warnings.push(`Matched saved meal “${savedHit.name}”. You can still edit items before logging.`);
  } else {
    const components = extraction?.components ?? [];
    if (components.length === 0) {
      warnings.push("No foods were identified in that description. You can search manually.");
    }
    for (const component of components) {
      const resolved = resolveFoodComponent(component, context);
      if (resolved.expanded.length > 0) {
        items.push(...resolved.expanded);
      } else {
        items.push(resolved.item);
      }
      candidatesByItem.push(resolved.candidates.slice(0, 5));
      if (resolved.item.matchStatus === "unmatched") {
        warnings.push(`“${component.phrase}” could not be matched and was not dropped — add it from search if needed.`);
      }
      if (resolved.item.matchStatus === "needs_portion") {
        warnings.push(`“${resolved.item.identity.foodName}” needs a quantity or serving before it can be included in totals.`);
      }
    }
  }

  const totals = sumNutrients(items.map((item) => item.nutrients));
  const loggedAt = input.loggedAt ?? new Date().toISOString();
    const inferredMealType = (MEAL_TYPES as readonly string[]).includes(input.mealType ?? "")
      ? (input.mealType as MealType)
      : inferMealType(localHourFromInstant(loggedAt, input.timezone), originalText);
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const duplicate = await state.nutritionRepository.recentIdentical(userId, originalText, since);

  const unresolved = [
    ...parsedMeal.unresolvedFragments,
    ...items.filter((item) => item.matchStatus === "unmatched").map((item) => item.identity.foodName),
  ];

  return {
    originalText,
    transcription: input.sourceType === "voice" ? originalText : null,
    parsedMeal,
    items,
    totals,
    unresolved,
    warnings: [...new Set(warnings)],
    inferredMealType,
    parseVersion: PARSER_VERSION,
    promptVersion: PROMPT_VERSION,
    modelVersion: interpretationModelVersion(parsedMeal.parseSource, state.config.openaiInterpretationModel),
    engineVersion: FOOD_ENGINE_VERSION,
    duplicateOf: duplicate ? { id: duplicate.id, loggedAt: duplicate.loggedAt } : null,
    candidatesByItem,
  };
}
