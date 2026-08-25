import type { NutrientKey, NutrientPanel } from "./nutrients.js";

export type DayCompleteness = "complete" | "partial" | "unmarked";

export type TargetKind = "target" | "minimum" | "limit" | "range";

export interface NutrientTarget {
  readonly kind: TargetKind;
  readonly value?: number | null;
  readonly min?: number | null;
  readonly max?: number | null;
}

export type NutritionTargets = {
  readonly energyKcal?: NutrientTarget | null;
  readonly proteinG?: NutrientTarget | null;
  readonly carbohydrateG?: NutrientTarget | null;
  readonly fatG?: NutrientTarget | null;
  readonly fibreG?: NutrientTarget | null;
  readonly sodiumMg?: NutrientTarget | null;
  readonly extra?: Readonly<Record<string, NutrientTarget>>;
};

export interface FoodIdentity {
  readonly foodId: string | null;
  readonly foodName: string;
  readonly brand: string | null;
  readonly sourceDataset: string | null;
  readonly sourceFoodId: string | null;
  readonly customFoodId: string | null;
  readonly savedMealId: string | null;
  readonly recipeId: string | null;
  readonly source: "AUSNUT" | "AFCD" | "CUSTOM" | "SAVED_MEAL" | "RECIPE" | "UNRESOLVED";
}

export interface ServingSnapshot {
  readonly servingId: string | null;
  readonly servingLabel: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly grams: number | null;
  readonly millilitres: number | null;
}

export interface NutritionMealItem {
  readonly id: string;
  readonly originalFragment: string;
  readonly identity: FoodIdentity;
  readonly serving: ServingSnapshot;
  readonly nutrients: NutrientPanel;
  readonly assumptions: readonly string[];
  readonly matchConfidence: number;
  readonly matchStatus: "resolved" | "ambiguous" | "unmatched" | "needs_portion";
  readonly databaseSha256: string | null;
  readonly sourceVersion: string | null;
}

export interface NutritionMealLog {
  readonly id: string;
  readonly userId: string;
  readonly loggedAt: string;
  readonly timezone: string;
  readonly localDate: string;
  readonly mealType: string;
  readonly originalText: string;
  readonly transcription: string | null;
  readonly parseVersion: string;
  readonly promptVersion: string | null;
  readonly modelVersion: string | null;
  readonly items: readonly NutritionMealItem[];
  readonly totals: NutrientPanel;
  readonly confidence: number;
  readonly source: "voice" | "text" | "saved_meal" | "search" | "repeat" | "recipe";
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DayStatus {
  readonly localDate: string;
  readonly completeness: Exclude<DayCompleteness, "unmarked">;
}

export interface Coverage {
  readonly calendarDays: number;
  readonly loggedDays: number;
  readonly completeDays: number;
  readonly partialDays: number;
  readonly unmarkedLoggedDays: number;
  readonly note: string;
}

export interface PeriodAverages {
  readonly onLoggedDays: NutrientPanel;
  readonly onCompleteDays: NutrientPanel | null;
}

export interface ContributionRow {
  readonly label: string;
  readonly amount: number;
  readonly percent: number;
}

export interface TargetAdherence {
  readonly key: NutrientKey;
  readonly daysEvaluated: number;
  readonly daysMet: number;
  readonly kind: TargetKind;
}

export function hasConfiguredTarget(target: NutrientTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.kind === "range") return target.min != null || target.max != null;
  return target.value != null;
}

export function targetValue(target: NutrientTarget | null | undefined): number | null {
  if (!target) return null;
  if (target.kind === "range") return target.max ?? target.min ?? null;
  return target.value ?? null;
}

export function dayMeetsTarget(value: number | null, target: NutrientTarget): boolean | null {
  if (value === null) return null;
  if (target.kind === "minimum" && target.value != null) return value >= target.value;
  if (target.kind === "limit" && target.value != null) return value <= target.value;
  if (target.kind === "target" && target.value != null) {
    const tolerance = Math.max(target.value * 0.1, 1);
    return Math.abs(value - target.value) <= tolerance || value >= target.value * 0.9;
  }
  if (target.kind === "range") {
    if (target.min != null && value < target.min) return false;
    if (target.max != null && value > target.max) return false;
    return target.min != null || target.max != null;
  }
  return null;
}
