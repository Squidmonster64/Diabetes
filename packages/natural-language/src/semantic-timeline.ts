import type { SemanticEvent } from "./semantic-events.js";

export interface SemanticTimelineGroup {
  readonly heading: string;
  readonly sortMinutes: number;
  readonly events: readonly SemanticEvent[];
}

function headingFor(event: SemanticEvent): { heading: string; sortMinutes: number } {
  if (event.relativeTimeMinutes === 0 || event.relativeTime === "now") {
    return { heading: "CURRENT", sortMinutes: 0 };
  }
  if (event.relativeTimeMinutes != null) {
    const minutes = event.relativeTimeMinutes;
    const ago = minutes < 0;
    const abs = Math.abs(minutes);
    if (abs < 60) {
      return { heading: `${abs} MIN ${ago ? "AGO" : "FROM NOW"}`, sortMinutes: minutes };
    }
    const hours = Math.round(abs / 60);
    return { heading: `${hours} HOUR${hours === 1 ? "" : "S"} ${ago ? "AGO" : "FROM NOW"}`, sortMinutes: minutes };
  }
  if (event.relativeTime) {
    return { heading: event.relativeTime.toUpperCase(), sortMinutes: Number.NEGATIVE_INFINITY };
  }
  return { heading: "STATED", sortMinutes: Number.NEGATIVE_INFINITY };
}

export function groupSemanticEvents(events: readonly SemanticEvent[]): SemanticTimelineGroup[] {
  const buckets = new Map<string, SemanticTimelineGroup>();
  for (const event of events) {
    if (event.type === "UNKNOWN" && events.length > 1) continue;
    const { heading, sortMinutes } = headingFor(event);
    const existing = buckets.get(heading);
    if (existing) {
      buckets.set(heading, { ...existing, events: [...existing.events, event] });
    } else {
      buckets.set(heading, { heading, sortMinutes, events: [event] });
    }
  }
  return [...buckets.values()].sort((left, right) => right.sortMinutes - left.sortMinutes);
}

export function describeSemanticEvent(event: SemanticEvent): { label: string; value: string; needsConfirmation: boolean } {
  switch (event.type) {
    case "GLUCOSE_READING":
      return {
        label: "Glucose",
        value:
          event.qualitativeValue ??
          (event.glucoseValue != null ? `${event.glucoseValue}${event.glucoseUnit ? ` ${event.glucoseUnit}` : ""}` : "unresolved"),
        needsConfirmation: event.unresolvedFields.length > 0 || event.glucoseUnit == null,
      };
    case "SYMPTOM":
      return { label: "Symptom", value: event.symptom ? capitalize(event.symptom) : event.originalFragment, needsConfirmation: false };
    case "INSULIN_TAKEN":
      return {
        label: event.actionStatus === "TAKEN" ? "Insulin already taken" : `Insulin (${event.actionStatus ?? "unknown"})`,
        value: `${event.insulinAmountUnits ?? "unresolved"} U${event.insulinType ? ` ${event.insulinType}` : ""}`,
        needsConfirmation: event.actionStatus !== "TAKEN" || event.insulinAmountUnits == null,
      };
    case "MEAL":
      return {
        label: "Meal",
        value: event.mealDescription ?? event.originalFragment,
        needsConfirmation: event.unresolvedFields.length > 0 || event.foods.some((item) => item.quantity == null),
      };
    case "ACTIVITY":
      return { label: "Activity", value: event.activityDescription ?? event.originalFragment, needsConfirmation: event.activityStatus !== "COMPLETED" };
    case "MEAL_DOSE_REQUEST":
      return { label: "Dose request", value: "A dose was asked for. No units were generated.", needsConfirmation: true };
    case "CORRECTION_REQUEST":
      return { label: "Correction request", value: "A correction was asked for. No units were generated.", needsConfirmation: true };
    case "SETTINGS_CHANGE_ATTEMPT":
      return { label: "Settings", value: "Settings language noticed. Nothing was changed.", needsConfirmation: true };
    case "REVIEW_EVENT":
      return { label: "Review", value: event.originalFragment, needsConfirmation: true };
    default:
      return { label: event.type, value: event.originalFragment, needsConfirmation: true };
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
