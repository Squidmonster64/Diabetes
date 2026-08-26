import { extractGlucose } from "./extract-glucose.js";
import { extractInsulin } from "./extract-insulin.js";
import { extractFoods } from "./extract-foods.js";
import { extractStatedCarbs } from "./extract-stated-carbs.js";
import { detectSymptoms } from "./detect-symptoms.js";
import { parseTimeExpression } from "./extract-times.js";
import { doseOrCorrectionRequestDetected, reviewEventDetected } from "./acceptance-intent.js";
import { settingsLanguageDetected } from "./classify-intent.js";
import { emptySemanticEvent, type InsulinActionStatus, type SemanticEvent } from "./semantic-events.js";
import { normaliseText } from "./normalise.js";
import type { GlucoseUnit } from "./types.js";

const ACTIVITY_PATTERN =
  /\b(?:ran|run|running|walked|walking|ride|rode|riding|cycling|gym|workout|exercise|exercising|swam|swim|finished a .{0,24}run)\b/i;

const DOSE_REQUEST_CLAUSE =
  /\b(?:give me(?:\s+a)?(?:\s+\d+(?:\.\d+)?)?\s*(?:units?|bolus|correction|dose)|how much insulin|what should i take|need a correction|dose me|dose this|calculate(?:\s+a)?\s+(?:bolus|dose)|i need\s+\d+(?:\.\d+)?\s*units?|should i take)\b/i;

function splitEventClauses(text: string): string[] {
  const sentences = text
    .split(/(?:\.(?!\d)|[?!\n]+)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const clauses: string[] = [];
  for (const sentence of sentences) {
    const mealSplit = sentence.split(/\s*,\s*(?=(?:breakfast|lunch|dinner)\s+was\b)/i);
    for (const mealPiece of mealSplit) {
      const pieces = mealPiece.split(
        /\s+\band\s+(?:now\s+)?(?=i\s+(?:feel|felt|took|ate|had|injected|checked|need)|i(?:'m| am)\s+|another\s+\d|(?:\d+(?:\.\d+)?)\s+(?:two hours later|later|units again)\b|took\s+\d|ate\b|\d+(?:\.\d+)?\s+units again)/i,
      );
      for (const piece of pieces) {
        const trimmed = piece.trim();
        if (trimmed) clauses.push(trimmed);
      }
    }
  }
  return clauses.length > 0 ? clauses : [text.trim()].filter(Boolean);
}

function relativeLabel(clause: string, referenceNowMs: number): {
  relativeTime: string | null;
  relativeTimeMinutes: number | null;
  eventTime: string | null;
} {
  const parsed = parseTimeExpression(clause, referenceNowMs);
  const approx = /\b(?:about|around|roughly|maybe|sometime)\b/i.test(clause);
  if (parsed.status === "requires_review") {
    return { relativeTime: parsed.rawSpan || null, relativeTimeMinutes: null, eventTime: null };
  }
  if (parsed.status === "missing" || !parsed.value) {
    if (
      /\b(?:now|currently|just)\b/i.test(clause) ||
      (!parsed.rawSpan &&
        /(?:glucose|feel|feeling|bg|bgl|nauseous|shaky)\b/i.test(clause) &&
        !/\bago\b|\byesterday\b|\blast night\b|\bat\s+\d/i.test(clause))
    ) {
      return { relativeTime: "now", relativeTimeMinutes: 0, eventTime: new Date(referenceNowMs).toISOString() };
    }
    return { relativeTime: null, relativeTimeMinutes: null, eventTime: null };
  }
  const minutes = Math.round((Date.parse(parsed.value) - referenceNowMs) / 60_000);
  const label = parsed.rawSpan || (minutes === 0 ? "now" : `${Math.abs(minutes)} minutes ${minutes < 0 ? "ago" : "from now"}`);
  return {
    relativeTime: approx ? `about ${label}` : label,
    relativeTimeMinutes: minutes,
    eventTime: parsed.value,
  };
}

function unitLabel(unit: GlucoseUnit | null): "mmol/L" | "mg/dL" | null {
  if (unit === "MMOL_L") return "mmol/L";
  if (unit === "MG_DL") return "mg/dL";
  return null;
}

function insulinActionStatus(clause: string): InsulinActionStatus {
  if (DOSE_REQUEST_CLAUSE.test(clause)) return "REQUESTED";
  if (/\b(?:might|may|going to|about to|plan to|should take|was going to|i need)\b/i.test(clause)) return "PLANNED";
  if (/\bprimed\b/i.test(clause) && !/\binjected\b/i.test(clause)) return "PRIMED";
  if (/\bdiall(?:ed|ed)\b/i.test(clause) && !/\binjected\b/i.test(clause)) return "DIALLED";
  if (/\b(?:think|maybe|not sure|can't remember|cannot remember)\b/i.test(clause)) return "UNCERTAIN";
  if (/\b(?:took|injected|gave myself|had \d)/i.test(clause)) return "TAKEN";
  return "UNKNOWN";
}

function activityStatus(clause: string): "COMPLETED" | "ONGOING" | "PLANNED" {
  if (/\b(?:going to|about to|plan to|in \d+|going for)\b/i.test(clause)) return "PLANNED";
  if (/\b(?:am exercising|currently|right now)\b/i.test(clause)) return "ONGOING";
  return "COMPLETED";
}

function isNegated(clause: string): boolean {
  if (/\bbut no breakfast\b/i.test(clause)) return false;
  return /\b(?:did not|didn't|didnt|haven't|have not|hasn't|wasn't|was not|no breakfast|nothing to eat|skipped|i don't|do not)\b/i.test(
    clause,
  );
}

function conflictingReadings(text: string): Array<{ value: number; fragment: string }> {
  const pairs: Array<RegExp> = [
    /\bone meter says\s+(\d+(?:\.\d+)?).{0,80}?(?:the )?other(?: meter)? says\s+(\d+(?:\.\d+)?)/i,
    /\b(?:cgm|sensor) says\s+(\d+(?:\.\d+)?).{0,80}?finger\s*prick(?: says)?\s+(\d+(?:\.\d+)?)/i,
    /\bfinger\s*prick(?: is| says)?\s+(\d+(?:\.\d+)?).{0,80}?(?:sensor|cgm) says\s+(\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of pairs) {
    const match = text.match(pattern);
    if (match?.[1] && match[2]) {
      return [
        { value: Number(match[1]), fragment: match[0] },
        { value: Number(match[2]), fragment: match[0] },
      ];
    }
  }
  return [];
}

/**
 * Splits an utterance into independently timed semantic events.
 * This never invents a treatment dose or nutrient total.
 */
export function extractSemanticEvents(originalText: string, referenceNowMs: number): SemanticEvent[] {
  const clauses = splitEventClauses(normaliseText(originalText));
  const events: SemanticEvent[] = [];
  let order = 0;

  const doseFlags = doseOrCorrectionRequestDetected(originalText);
  const giveMeDose = /\bgive me\s+\d+(?:\.\d+)?\s*units?\b/i.test(originalText);
  if (settingsLanguageDetected(originalText)) {
    events.push(
      emptySemanticEvent({
        id: `event_${++order}`,
        type: "SETTINGS_CHANGE_ATTEMPT",
        originalFragment: originalText,
        sourceOrder: order,
        confidence: 0.9,
      }),
    );
  }
  if (reviewEventDetected(originalText) && !doseFlags.dose && !doseFlags.correction) {
    events.push(
      emptySemanticEvent({
        id: `event_${++order}`,
        type: "REVIEW_EVENT",
        originalFragment: originalText,
        sourceOrder: order,
        confidence: 0.8,
      }),
    );
  }

  const conflicts = conflictingReadings(originalText);
  if (conflicts.length === 2) {
    for (const reading of conflicts) {
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "GLUCOSE_READING",
          originalFragment: reading.fragment,
          sourceOrder: order,
          confidence: 0.7,
          unresolvedFields: ["glucose.conflict"],
          glucoseValue: reading.value,
          relativeTime: null,
        }),
      );
    }
  }

  for (const clause of clauses) {
    const time = relativeLabel(clause, referenceNowMs);
    const negated = isNegated(clause);
    const glucose = conflicts.length === 2 ? null : extractGlucose(clause, referenceNowMs);
    const insulin = extractInsulin(clause, referenceNowMs);
    const meal = negated ? null : extractFoods(clause);
    const carbs = extractStatedCarbs(clause);
    const symptoms = detectSymptoms(clause);
    const unresolved: string[] = [];
    const requested = insulinActionStatus(clause) === "REQUESTED" || DOSE_REQUEST_CLAUSE.test(clause);

    if (!glucose && /^\d+(?:\.\d+)?\s+(?:two hours later|later)\b/i.test(clause)) {
      const value = Number(clause.match(/^(\d+(?:\.\d+)?)/)![1]);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "GLUCOSE_READING",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.7,
          glucoseValue: value,
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    } else if (!glucose && /\bglucose has been (?:rising|falling|dropping|between)\b/i.test(clause)) {
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "GLUCOSE_READING",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.5,
          unresolvedFields: ["glucose.value"],
          relativeTime: time.relativeTime,
        }),
      );
    }

    if (glucose) {
      if (glucose.unit.value == null && glucose.value.value != null) unresolved.push("glucose.unit");
      if (glucose.ambiguousReason) unresolved.push("glucose.value");
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "GLUCOSE_READING",
          originalFragment: clause,
          sourceOrder: order,
          confidence: glucose.value.confidence || 0.7,
          unresolvedFields: unresolved,
          glucoseValue: glucose.value.value,
          glucoseUnit: unitLabel(glucose.unit.value),
          qualitativeValue: glucose.qualitativeFlag ?? null,
          eventTime: glucose.timestamp.rawSpan ? glucose.timestamp.value : time.eventTime,
          relativeTime: glucose.timestamp.rawSpan || time.relativeTime,
          relativeTimeMinutes:
            glucose.timestamp.value && glucose.timestamp.rawSpan
              ? Math.round((Date.parse(glucose.timestamp.value) - referenceNowMs) / 60_000)
              : time.relativeTimeMinutes,
        }),
      );
    }

    if ((doseFlags.correction || /correction/i.test(clause)) && (glucose || /correction/i.test(clause)) && !meal) {
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "CORRECTION_REQUEST",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.85,
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    }

    if (requested || (giveMeDose && /give me|need \d|should i take|how much insulin|dose me|bolus/i.test(clause))) {
      const isMealDose =
        Boolean(meal) ||
        Boolean(carbs) ||
        /meal|carbs?|bolus|dinner|lunch|breakfast|for this/i.test(clause) ||
        giveMeDose ||
        /\bi need\s+\d/i.test(clause) ||
        /\bshould i take\b/i.test(clause);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: isMealDose && !/correction/i.test(clause) ? "MEAL_DOSE_REQUEST" : "CORRECTION_REQUEST",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.85,
          insulinAmountUnits: null,
          actionStatus: "REQUESTED",
          statedCarbohydrateGrams: carbs?.value ?? null,
        }),
      );
    } else if (insulin && !negated) {
      const status = insulinActionStatus(clause);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "INSULIN_TAKEN",
          originalFragment: clause,
          sourceOrder: order,
          confidence: insulin.amountUnits.confidence || 0.7,
          unresolvedFields: [
            ...(insulin.amountUnits.value == null ? ["insulin.amountUnits"] : []),
            ...(insulin.takenAt.status === "requires_review" ? ["insulin.takenAt"] : []),
          ],
          insulinAmountUnits: insulin.amountUnits.value,
          insulinType: insulin.insulinType.value,
          actionStatus: status,
          eventTime: insulin.takenAt.value,
          relativeTime: insulin.takenAt.rawSpan || time.relativeTime,
          relativeTimeMinutes: insulin.takenAt.value
            ? Math.round((Date.parse(insulin.takenAt.value) - referenceNowMs) / 60_000)
            : time.relativeTimeMinutes,
        }),
      );
    } else if (!negated && /(?:another\s+(\d+(?:\.\d+)?)(?:\s*units?)?|(\d+(?:\.\d+)?)\s+units again)/i.test(clause)) {
      const amountMatch = clause.match(/another\s+(\d+(?:\.\d+)?)/i) ?? clause.match(/(\d+(?:\.\d+)?)\s+units again/i);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "INSULIN_TAKEN",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.75,
          insulinAmountUnits: amountMatch ? Number(amountMatch[1]) : null,
          actionStatus: "TAKEN",
          eventTime: time.eventTime,
          relativeTime: time.relativeTime || (/just now/i.test(clause) ? "now" : null),
          relativeTimeMinutes: /just now/i.test(clause) ? 0 : time.relativeTimeMinutes,
        }),
      );
    } else if (!negated && /\b(?:was going to take|might take|may take|plan to take|about to take)\b/i.test(clause) && /\bunits?\b/i.test(clause)) {
      const amount = clause.match(/(\d+(?:\.\d+)?)\s*units?/i);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "INSULIN_TAKEN",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.6,
          unresolvedFields: amount ? [] : ["insulin.amountUnits"],
          insulinAmountUnits: amount ? Number(amount[1]) : null,
          actionStatus: "PLANNED",
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    }

    if (meal && meal.components.length > 0) {
      const names = meal.parsedMeal.items.map((item) => item.foodName);
      const sandwichKept = names.some((name) => /sandwich|fish and chips|toast/i.test(name)) || /sandwich|fish and chips/i.test(clause);
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "MEAL",
          originalFragment: clause,
          sourceOrder: order,
          confidence: meal.parsedMeal.parseConfidence || 0.7,
          unresolvedFields: meal.parsedMeal.unresolvedFragments,
          mealDescription: sandwichKept && /cheese sandwich/i.test(clause) ? "cheese sandwich" : names.join(" and ") || clause,
          foods: meal.parsedMeal.items,
          statedCarbohydrateGrams: carbs?.value ?? null,
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    } else if (carbs?.value != null && !negated) {
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "MEAL",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.7,
          statedCarbohydrateGrams: carbs.value,
          mealDescription: clause,
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    }

    if (!negated) {
      for (const symptom of symptoms.statedSymptoms) {
        events.push(
          emptySemanticEvent({
            id: `event_${++order}`,
            type: "SYMPTOM",
            originalFragment: clause,
            sourceOrder: order,
            confidence: 0.9,
            symptom,
            eventTime: time.eventTime,
            relativeTime: time.relativeTime,
            relativeTimeMinutes: time.relativeTimeMinutes,
          }),
        );
      }
    }

    if (ACTIVITY_PATTERN.test(clause) && !meal) {
      events.push(
        emptySemanticEvent({
          id: `event_${++order}`,
          type: "ACTIVITY",
          originalFragment: clause,
          sourceOrder: order,
          confidence: 0.7,
          activityDescription: clause,
          activityStatus: activityStatus(clause),
          eventTime: time.eventTime,
          relativeTime: time.relativeTime,
          relativeTimeMinutes: time.relativeTimeMinutes,
        }),
      );
    }
  }

  if (events.length === 0) {
    events.push(
      emptySemanticEvent({
        id: "event_1",
        type: "UNKNOWN",
        originalFragment: originalText,
        sourceOrder: 1,
        confidence: 0.3,
        unresolvedFields: ["meaning"],
      }),
    );
  }

  return events;
}

const SAFETY_TYPES = new Set(["MEAL", "GLUCOSE_READING", "INSULIN_TAKEN", "SYMPTOM"]);

export function mergeSemanticEvents(deterministic: readonly SemanticEvent[], overlay: readonly SemanticEvent[]): SemanticEvent[] {
  if (overlay.length === 0) return [...deterministic];
  const overlaySafety = overlay.filter((event) => SAFETY_TYPES.has(event.type)).length;
  const deterministicSafety = deterministic.filter((event) => SAFETY_TYPES.has(event.type)).length;
  if (overlaySafety < deterministicSafety) return [...deterministic];

  const merged = [...deterministic];
  for (const extra of overlay) {
    const same = merged.some((event) => eventsEquivalent(event, extra));
    if (!same) {
      merged.push({ ...extra, id: `event_${merged.length + 1}`, sourceOrder: merged.length + 1 });
    }
  }
  return merged;
}

function eventsEquivalent(left: SemanticEvent, right: SemanticEvent): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "GLUCOSE_READING") return left.glucoseValue === right.glucoseValue && left.qualitativeValue === right.qualitativeValue;
  if (left.type === "INSULIN_TAKEN") return left.insulinAmountUnits === right.insulinAmountUnits && left.actionStatus === right.actionStatus;
  if (left.type === "SYMPTOM") return left.symptom === right.symptom;
  if (left.type === "MEAL") {
    const leftName = (left.mealDescription ?? "").toLowerCase();
    const rightName = (right.mealDescription ?? "").toLowerCase();
    return Boolean(leftName && rightName && (leftName.includes(rightName) || rightName.includes(leftName) || left.foods.length === right.foods.length));
  }
  return left.originalFragment === right.originalFragment;
}

export function semanticEventsFromUnknown(value: unknown): SemanticEvent[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const rawEvents = Array.isArray(record.events) ? record.events : [];
  const events: SemanticEvent[] = [];
  for (const [index, item] of rawEvents.entries()) {
    if (!item || typeof item !== "object") continue;
    const event = item as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : "UNKNOWN";
    events.push(
      emptySemanticEvent({
        id: `event_${index + 1}`,
        type: type as SemanticEvent["type"],
        originalFragment: typeof event.originalFragment === "string" ? event.originalFragment : "",
        sourceOrder: index + 1,
        confidence: typeof event.confidence === "number" ? event.confidence : 0.5,
        unresolvedFields: Array.isArray(event.unresolvedFields) ? event.unresolvedFields.map(String) : [],
        eventTime: typeof event.eventTime === "string" ? event.eventTime : null,
        relativeTime: typeof event.relativeTime === "string" ? event.relativeTime : null,
        relativeTimeMinutes: typeof event.relativeTimeMinutes === "number" ? event.relativeTimeMinutes : null,
        glucoseValue: typeof event.glucoseValue === "number" ? event.glucoseValue : null,
        glucoseUnit: event.glucoseUnit === "mmol/L" || event.glucoseUnit === "mg/dL" ? event.glucoseUnit : null,
        qualitativeValue: event.qualitativeValue === "HI" || event.qualitativeValue === "LO" ? event.qualitativeValue : null,
        insulinAmountUnits: typeof event.insulinAmountUnits === "number" ? event.insulinAmountUnits : null,
        insulinType: typeof event.insulinType === "string" ? event.insulinType : null,
        actionStatus: typeof event.actionStatus === "string" ? (event.actionStatus as InsulinActionStatus) : null,
        mealDescription: typeof event.mealDescription === "string" ? event.mealDescription : null,
        statedCarbohydrateGrams: typeof event.statedCarbohydrateGrams === "number" ? event.statedCarbohydrateGrams : null,
        symptom: typeof event.symptom === "string" ? event.symptom : null,
        activityDescription: typeof event.activityDescription === "string" ? event.activityDescription : null,
        activityStatus:
          event.activityStatus === "COMPLETED" || event.activityStatus === "ONGOING" || event.activityStatus === "PLANNED"
            ? event.activityStatus
            : null,
        foods: Array.isArray(event.foods)
          ? event.foods.flatMap((food) => {
              if (!food || typeof food !== "object") return [];
              const item = food as Record<string, unknown>;
              if (typeof item.foodName !== "string") return [];
              return [
                {
                  originalFragment: typeof item.originalFragment === "string" ? item.originalFragment : item.foodName,
                  foodName: item.foodName,
                  brand: typeof item.brand === "string" ? item.brand : null,
                  quantity: typeof item.quantity === "number" ? item.quantity : null,
                  unit: typeof item.unit === "string" ? (item.unit as never) : null,
                  originalUnit: typeof item.unit === "string" ? item.unit : null,
                  grams: typeof item.grams === "number" ? item.grams : null,
                  preparation: typeof item.preparation === "string" ? item.preparation : null,
                  modifiers: Array.isArray(item.modifiers) ? item.modifiers.map(String) : [],
                  confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
                  assumptions: Array.isArray(item.assumptions) ? item.assumptions.map(String) : [],
                  qualifier: typeof item.qualifier === "string" ? item.qualifier : null,
                },
              ];
            })
          : [],
      }),
    );
  }
  return events;
}
