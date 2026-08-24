import { emptyPanel, NUTRIENT_KEYS, sumNutrients, type NutrientKey, type NutrientPanel } from "./nutrients.js";
import { calendarDatesInclusive, type TimeRange } from "./time.js";
import type {
  ContributionRow,
  Coverage,
  DayCompleteness,
  DayStatus,
  NutrientTarget,
  NutritionMealLog,
  NutritionTargets,
  PeriodAverages,
  TargetAdherence,
} from "./types.js";
import { dayMeetsTarget, hasConfiguredTarget } from "./types.js";

export interface DailyTotals {
  readonly localDate: string;
  readonly totals: NutrientPanel;
  readonly mealCount: number;
  readonly completeness: DayCompleteness;
  readonly logged: boolean;
}

function completenessFor(date: string, status: readonly DayStatus[], logged: boolean): DayCompleteness {
  const marked = status.find((row) => row.localDate === date);
  if (marked) return marked.completeness;
  return logged ? "unmarked" : "unmarked";
}

export function dailyTotalsFromMeals(
  meals: readonly NutritionMealLog[],
  status: readonly DayStatus[],
  from: string,
  to: string,
): DailyTotals[] {
  const byDate = new Map<string, NutritionMealLog[]>();
  for (const meal of meals) {
    const list = byDate.get(meal.localDate) ?? [];
    list.push(meal);
    byDate.set(meal.localDate, list);
  }
  return calendarDatesInclusive(from, to).map((localDate) => {
    const dayMeals = byDate.get(localDate) ?? [];
    const logged = dayMeals.length > 0;
    return {
      localDate,
      totals: dayMeals.length === 0 ? emptyPanel() : sumNutrients(dayMeals.map((meal) => meal.totals)),
      mealCount: dayMeals.length,
      completeness: completenessFor(localDate, status, logged),
      logged,
    };
  });
}

function averagePanels(panels: readonly NutrientPanel[]): NutrientPanel {
  if (panels.length === 0) return emptyPanel();
  const summed = sumNutrients(panels);
  const extra: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(summed.extra)) {
    extra[key] = value === null ? null : Math.round((value / panels.length) * 10) / 10;
  }
  const result: Record<string, number | null> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = summed[key];
    result[key] = value === null ? null : Math.round((value / panels.length) * 10) / 10;
  }
  return { ...(result as Omit<NutrientPanel, "extra">), extra };
}

export function coverageFromDays(days: readonly DailyTotals[]): Coverage {
  const calendarDays = days.length;
  const loggedDays = days.filter((day) => day.logged).length;
  const completeDays = days.filter((day) => day.completeness === "complete").length;
  const partialDays = days.filter((day) => day.completeness === "partial").length;
  const unmarkedLoggedDays = days.filter((day) => day.logged && day.completeness === "unmarked").length;
  const note =
    loggedDays === 0
      ? "No food was logged in this period. Missing days are not treated as zero intake."
      : completeDays > 0
        ? `Trend based on ${loggedDays} logged day${loggedDays === 1 ? "" : "s"} out of ${calendarDays}; ${completeDays} marked complete.`
        : `Trend based on ${loggedDays} logged day${loggedDays === 1 ? "" : "s"} out of ${calendarDays}. Unlogged days are not treated as zero intake.`;
  return { calendarDays, loggedDays, completeDays, partialDays, unmarkedLoggedDays, note };
}

export function periodAverages(days: readonly DailyTotals[]): PeriodAverages {
  const logged = days.filter((day) => day.logged);
  const complete = days.filter((day) => day.completeness === "complete");
  return {
    onLoggedDays: averagePanels(logged.map((day) => day.totals)),
    onCompleteDays: complete.length > 0 ? averagePanels(complete.map((day) => day.totals)) : null,
  };
}

export function nutrientContributions(
  meals: readonly NutritionMealLog[],
  key: NutrientKey,
  limit = 8,
): readonly ContributionRow[] {
  const amounts = new Map<string, number>();
  let total = 0;
  for (const meal of meals) {
    for (const item of meal.items) {
      const value = item.nutrients[key];
      if (value === null || value <= 0) continue;
      const label = item.identity.foodName;
      amounts.set(label, (amounts.get(label) ?? 0) + value);
      total += value;
    }
  }
  if (total <= 0) return [];
  const ranked = [...amounts.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount * 10) / 10, percent: 0 }))
    .sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, limit);
  const otherAmount = ranked.slice(limit).reduce((sum, row) => sum + row.amount, 0);
  const rows = otherAmount > 0 ? [...top, { label: "Other", amount: Math.round(otherAmount * 10) / 10, percent: 0 }] : top;
  return rows.map((row) => ({ ...row, percent: Math.round((row.amount / total) * 1000) / 10 }));
}

export function targetAdherence(
  days: readonly DailyTotals[],
  targets: NutritionTargets,
): readonly TargetAdherence[] {
  const evaluatedDays = days.filter((day) => day.completeness === "complete" || (day.logged && day.completeness !== "partial"));
  const useDays = days.some((day) => day.completeness === "complete")
    ? days.filter((day) => day.completeness === "complete")
    : days.filter((day) => day.logged && day.completeness !== "partial");
  const pairs: Array<[NutrientKey, NutrientTarget | null | undefined]> = [
    ["energyKcal", targets.energyKcal],
    ["proteinG", targets.proteinG],
    ["carbohydrateG", targets.carbohydrateG],
    ["fatG", targets.fatG],
    ["fibreG", targets.fibreG],
    ["sodiumMg", targets.sodiumMg],
  ];
  return pairs.flatMap(([key, target]) => {
    if (!target || !hasConfiguredTarget(target)) return [];
    let daysMet = 0;
    let daysEvaluated = 0;
    for (const day of useDays) {
      const met = dayMeetsTarget(day.totals[key], target);
      if (met === null) continue;
      daysEvaluated += 1;
      if (met) daysMet += 1;
    }
    return [{ key, daysEvaluated: daysEvaluated || evaluatedDays.length, daysMet, kind: target.kind }];
  });
}

export function remainingCopy(key: NutrientKey, remaining: number | null, target: NutrientTarget | null | undefined): string | null {
  if (remaining === null || !target) return null;
  if (target.kind === "limit") {
    if (remaining < 0) return `${Math.abs(remaining)} over your configured limit`;
    return `Within your configured limit by ${remaining}`;
  }
  if (target.kind === "minimum") {
    if (remaining <= 0) return "At or above your minimum target";
    return `${remaining} remaining to reach your minimum`;
  }
  if (remaining < 0) return `${Math.abs(remaining)} above target`;
  return `${remaining} remaining`;
}

export function remainingTowardTarget(value: number | null, target: NutrientTarget | null | undefined): number | null {
  if (value === null || !target) return null;
  if (target.kind === "limit" && target.value != null) return Math.round((target.value - value) * 10) / 10;
  if (target.kind === "minimum" && target.value != null) return Math.round((target.value - value) * 10) / 10;
  if (target.kind === "target" && target.value != null) return Math.round((target.value - value) * 10) / 10;
  if (target.kind === "range" && target.max != null) return Math.round((target.max - value) * 10) / 10;
  return null;
}

export { type TimeRange };
