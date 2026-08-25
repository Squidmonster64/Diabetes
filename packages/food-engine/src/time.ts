export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "drink" | "other";

export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack", "drink", "other"];

export function localDateFromInstant(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date/time.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to format local date.");
  return `${year}-${month}-${day}`;
}

export function localHourFromInstant(iso: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(new Date(iso))
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

/**
 * Infer meal type from the spoken/typed text first, then from local clock hour.
 * Never blocks logging; the user can override afterwards.
 */
export function inferMealType(localHour: number, text = ""): MealType {
  const lower = text.toLowerCase();
  if (/\bbreakfast\b/.test(lower)) return "breakfast";
  if (/\blunch\b/.test(lower)) return "lunch";
  if (/\b(dinner|supper|tea time)\b/.test(lower)) return "dinner";
  if (/\bsnack\b/.test(lower)) return "snack";
  if (/\b(flat white|latte|cappuccino|long black|espresso)\b/.test(lower) && !/\b(and|with|plus)\b/.test(lower)) {
    return "drink";
  }
  if (localHour >= 5 && localHour <= 10) return "breakfast";
  if (localHour >= 11 && localHour <= 14) return "lunch";
  if (localHour >= 17 && localHour <= 21) return "dinner";
  return "snack";
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function calendarDatesInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

export function startOfIsoWeek(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (weekday - 1));
  return date.toISOString().slice(0, 10);
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function startOfYear(isoDate: string): string {
  return `${isoDate.slice(0, 4)}-01-01`;
}

export type TimeRange = "today" | "7d" | "30d" | "90d" | "365d" | "all";

export function rangeStart(today: string, range: TimeRange, earliestLoggedDate: string | null): string | null {
  if (range === "today") return today;
  if (range === "all") return earliestLoggedDate;
  if (range === "7d") return addCalendarDays(today, -6);
  if (range === "30d") return addCalendarDays(today, -29);
  if (range === "90d") return addCalendarDays(today, -89);
  return addCalendarDays(today, -364);
}
