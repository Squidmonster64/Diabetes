import { CORE_DISPLAY_NUTRIENTS, NUTRIENT_META, formatNutrient, type NutrientKey, type NutrientPanel } from "./nutrients.js";
import { remainingCopy, remainingTowardTarget, type DailyTotals } from "./aggregations.js";
import { nutrientContributions } from "./aggregations.js";
import type { NutritionMealLog, NutritionTargets, NutrientTarget } from "./types.js";
import { dayMeetsTarget, hasConfiguredTarget, targetValue } from "./types.js";

export interface InsightStatement {
  readonly text: string;
  readonly tone: "neutral" | "on_track" | "short" | "over";
}

export interface DailyInsight {
  readonly statements: readonly InsightStatement[];
  readonly topSodium: readonly { label: string; amount: number }[];
}

function targetFor(targets: NutritionTargets, key: NutrientKey): NutrientTarget | null | undefined {
  if (key === "energyKcal") return targets.energyKcal;
  if (key === "proteinG") return targets.proteinG;
  if (key === "carbohydrateG") return targets.carbohydrateG;
  if (key === "fatG") return targets.fatG;
  if (key === "fibreG") return targets.fibreG;
  if (key === "sodiumMg") return targets.sodiumMg;
  return targets.extra?.[key];
}

export function buildDailyInsight(totals: NutrientPanel, targets: NutritionTargets | null, meals: readonly NutritionMealLog[]): DailyInsight {
  const statements: InsightStatement[] = [];
  if (!targets) {
    statements.push({
      text: `Today's intake: ${formatNutrient(totals.energyKcal, "kcal")}, protein ${formatNutrient(totals.proteinG, "g")}, fibre ${formatNutrient(totals.fibreG, "g")}, sodium ${formatNutrient(totals.sodiumMg, "mg")}.`,
      tone: "neutral",
    });
  } else {
    for (const key of CORE_DISPLAY_NUTRIENTS) {
      const target = targetFor(targets, key);
      const meta = NUTRIENT_META.find((item) => item.key === key);
      if (!meta || !hasConfiguredTarget(target ?? null)) continue;
      const value = totals[key];
      const met = dayMeetsTarget(value, target!);
      if (key === "sodiumMg" && met === false) {
        statements.push({ text: "Sodium is already above your daily limit.", tone: "over" });
      } else if (key === "fibreG" && met === false) {
        statements.push({ text: "Fibre is below your target.", tone: "short" });
      } else if (key === "proteinG" && met === false) {
        statements.push({ text: "Protein is below your minimum target.", tone: "short" });
      } else if (key === "proteinG" && met === true) {
        statements.push({ text: "Protein is close to or above target.", tone: "on_track" });
      } else if (key === "energyKcal" && met === true) {
        statements.push({ text: "Energy is near your configured target.", tone: "on_track" });
      }
      const remaining = remainingTowardTarget(value, target);
      const copy = remainingCopy(key, remaining, target);
      if (copy && key === "sodiumMg") {
        // Avoid encouraging leftover sodium consumption.
        continue;
      }
    }
    if (statements.length === 0) {
      statements.push({ text: "Today's totals are shown below. No target judgement is applied where data is missing.", tone: "neutral" });
    }
  }

  const sodium = nutrientContributions(meals, "sodiumMg", 3)
    .filter((row) => row.label !== "Other")
    .map((row) => ({ label: row.label, amount: row.amount }));
  if (sodium.length > 0 && totals.sodiumMg !== null) {
    statements.push({
      text: `Most sodium came from: ${sodium.map((row) => row.label).join(", ")}.`,
      tone: "neutral",
    });
  }
  return { statements, topSodium: sodium };
}

export interface DetectedPattern {
  readonly text: string;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function detectPatterns(days: readonly DailyTotals[], meals: readonly NutritionMealLog[]): readonly DetectedPattern[] {
  const logged = days.filter((day) => day.logged && day.totals.fibreG !== null);
  const patterns: DetectedPattern[] = [];
  if (logged.length >= 8) {
    const weekend = logged.filter((day) => {
      const dayOfWeek = weekday(day.localDate);
      return dayOfWeek === 0 || dayOfWeek === 6;
    });
    const weekdayDays = logged.filter((day) => {
      const dayOfWeek = weekday(day.localDate);
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    });
    if (weekend.length >= 3 && weekdayDays.length >= 3) {
      const weekendAvg = average(weekend.map((day) => day.totals.fibreG as number));
      const weekdayAvg = average(weekdayDays.map((day) => day.totals.fibreG as number));
      if (weekdayAvg > 0 && weekendAvg < weekdayAvg * 0.85) {
        patterns.push({ text: "Your fibre intake is consistently lower on weekends than on weekdays." });
      }
    }
  }

  const proteinMeals = meals.filter((meal) => meal.totals.proteinG !== null && meal.totals.proteinG > 0);
  if (proteinMeals.length >= 10) {
    const byType = new Map<string, number>();
    let total = 0;
    for (const meal of proteinMeals) {
      const value = meal.totals.proteinG ?? 0;
      byType.set(meal.mealType, (byType.get(meal.mealType) ?? 0) + value);
      total += value;
    }
    const breakfast = byType.get("breakfast") ?? 0;
    if (total > 0 && breakfast / total >= 0.3) {
      patterns.push({
        text: `Breakfast contributes ${Math.round((breakfast / total) * 100)}% of your protein on logged days.`,
      });
    }
  }

  const sodiumByType = new Map<string, number>();
  for (const meal of meals) {
    if (meal.totals.sodiumMg === null) continue;
    sodiumByType.set(meal.mealType, (sodiumByType.get(meal.mealType) ?? 0) + meal.totals.sodiumMg);
  }
  const lunchSodium = sodiumByType.get("lunch") ?? 0;
  const dinnerSodium = sodiumByType.get("dinner") ?? 0;
  if (lunchSodium + dinnerSodium > 0 && lunchSodium > dinnerSodium * 1.25 && meals.length >= 8) {
    patterns.push({ text: "Most of your sodium comes from lunch rather than dinner." });
  }

  return patterns;
}

export function percentOfTarget(value: number | null, target: NutrientTarget | null | undefined): number | null {
  const configured = targetValue(target ?? null);
  if (value === null || configured === null || configured === 0) return null;
  return Math.round((value / configured) * 100);
}
