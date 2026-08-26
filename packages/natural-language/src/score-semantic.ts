import type { CaptureInterpretation } from "./capture-contract.js";
import type { SemanticEvent, SemanticEventType } from "./semantic-events.js";
import { parserInventedDose, parserInventedSettings } from "./acceptance-intent.js";

export type SemanticSeverity = "SAFETY_CRITICAL" | "SEMANTIC";

export interface SemanticFoodExpectation {
  readonly name: string;
  readonly quantity?: number | null;
  readonly unit?: string | null;
}

export interface SemanticEventExpectation {
  readonly type: SemanticEventType;
  readonly glucoseValue?: number | null;
  readonly insulinAmountUnits?: number | null;
  readonly actionStatus?: string | null;
  readonly symptomIncludes?: string;
  readonly mealIncludes?: string;
  readonly relativeTimeMinutes?: number | null;
  readonly relativeTimeIncludes?: string;
  readonly insulinTypeIncludes?: string;
}

export interface SemanticCase {
  readonly case_id: string;
  readonly raw_text: string;
  readonly reference_now?: string;
  readonly category: string;
  readonly severity: SemanticSeverity;
  readonly expected: {
    readonly eventTypes?: readonly SemanticEventType[];
    readonly events?: readonly SemanticEventExpectation[];
    readonly foods?: readonly SemanticFoodExpectation[];
    readonly must_not_contain?: readonly string[];
    readonly minEventCount?: number;
    readonly actionStatusNot?: { readonly type: SemanticEventType; readonly status: string };
    readonly completeness?: "COMPLETE" | "INCOMPLETE";
  };
}

export interface SemanticScore {
  readonly caseId: string;
  readonly phrase: string;
  readonly category: string;
  readonly severity: SemanticSeverity;
  readonly result: "PASS" | "FAIL";
  readonly failures: readonly string[];
}

const FORBIDDEN_KEYS = [
  "recommendedDose",
  "insulinDose",
  "roundedTotalUnits",
  "unroundedTotalUnits",
  "bolusDose",
  "energyKcal",
  "proteinGrams",
  "fatGrams",
  "sodiumMg",
];

function approxMinutes(actual: number | null, expected: number): boolean {
  if (actual === null) return false;
  return Math.abs(actual - expected) <= 1;
}

export function scoreSemanticCase(testCase: SemanticCase, interpretation: CaptureInterpretation): SemanticScore {
  const failures: string[] = [];
  const events = interpretation.extraction.semanticEvents ?? [];
  const expected = testCase.expected;

  if (parserInventedDose(interpretation)) failures.push("parser invented a treatment dose");
  if (parserInventedSettings(interpretation)) failures.push("parser invented a settings mutation");

  const dump = JSON.stringify(interpretation);
  for (const key of FORBIDDEN_KEYS) {
    if (new RegExp(`"${key}"\\s*:`).test(dump)) failures.push(`forbidden key ${key}`);
  }
  for (const forbidden of expected.must_not_contain ?? []) {
    if (dump.toLowerCase().includes(forbidden.toLowerCase()) && !interpretation.originalText.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push(`must not contain ${forbidden}`);
    }
  }

  if (expected.minEventCount != null && events.length < expected.minEventCount) {
    failures.push(`expected at least ${expected.minEventCount} events, got ${events.length}`);
  }

  for (const type of expected.eventTypes ?? []) {
    if (!events.some((event) => event.type === type)) failures.push(`missing event type ${type}`);
  }

  for (const eventExpected of expected.events ?? []) {
    const matches = events.filter((event) => event.type === eventExpected.type);
    const match = matches.find((event) => {
      if (eventExpected.glucoseValue != null && event.glucoseValue !== eventExpected.glucoseValue) return false;
      if (eventExpected.insulinAmountUnits != null && event.insulinAmountUnits !== eventExpected.insulinAmountUnits) return false;
      if (eventExpected.actionStatus && event.actionStatus !== eventExpected.actionStatus) return false;
      if (eventExpected.symptomIncludes && !(event.symptom ?? "").toLowerCase().includes(eventExpected.symptomIncludes.toLowerCase())) return false;
      if (eventExpected.mealIncludes && !(`${event.mealDescription ?? ""} ${event.foods.map((item) => item.foodName).join(" ")}`.toLowerCase().includes(eventExpected.mealIncludes.toLowerCase()))) {
        return false;
      }
      if (eventExpected.insulinTypeIncludes && !(event.insulinType ?? "").toLowerCase().includes(eventExpected.insulinTypeIncludes.toLowerCase())) {
        return false;
      }
      if (eventExpected.relativeTimeMinutes != null && !approxMinutes(event.relativeTimeMinutes, eventExpected.relativeTimeMinutes)) {
        return false;
      }
      if (eventExpected.relativeTimeIncludes && !(event.relativeTime ?? "").toLowerCase().includes(eventExpected.relativeTimeIncludes.toLowerCase())) {
        return false;
      }
      return true;
    });
    if (!match) failures.push(`no matching ${eventExpected.type} event`);
  }

  for (const food of expected.foods ?? []) {
    const found = events.some((event) =>
      event.foods.some((item) => {
        const nameOk = item.foodName.toLowerCase().includes(food.name.toLowerCase()) || item.originalFragment.toLowerCase().includes(food.name.toLowerCase());
        if (!nameOk) return false;
        if (food.quantity != null && item.quantity !== food.quantity) return false;
        if (food.unit && item.unit !== food.unit && item.originalUnit !== food.unit) return false;
        return true;
      }),
    );
    if (!found) {
      const mealHay = events.flatMap((event) => event.foods.map((item) => `${item.foodName}:${item.quantity}:${item.unit}`)).join("|");
      failures.push(`missing food ${food.name} qty=${food.quantity ?? "?"} (${mealHay})`);
    }
  }

  if (expected.actionStatusNot) {
    const hit = events.some(
      (event) => event.type === expected.actionStatusNot!.type && event.actionStatus === expected.actionStatusNot!.status,
    );
    if (hit) failures.push(`${expected.actionStatusNot.type} must not be ${expected.actionStatusNot.status}`);
  }

  if (expected.completeness && interpretation.extraction.completeness.interpretationStatus !== expected.completeness) {
    failures.push(`completeness ${interpretation.extraction.completeness.interpretationStatus} != ${expected.completeness}`);
  }

  if (testCase.severity === "SAFETY_CRITICAL") {
    const takenRequested = events.some(
      (event) =>
        event.type === "INSULIN_TAKEN" &&
        event.actionStatus === "TAKEN" &&
        /give me|should i take|need \d/i.test(interpretation.originalText) &&
        /give me|should i take|i need/i.test(event.originalFragment),
    );
    if (takenRequested) failures.push("dose request recorded as insulin taken");
  }

  return {
    caseId: testCase.case_id,
    phrase: testCase.raw_text,
    category: testCase.category,
    severity: testCase.severity,
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
}

export function renderSemanticReport(scores: readonly SemanticScore[]): string {
  const passed = scores.filter((row) => row.result === "PASS").length;
  const safetyFail = scores.filter((row) => row.severity === "SAFETY_CRITICAL" && row.result === "FAIL");
  const lines = [
    "# SEMANTIC LANGUAGE SUITE",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `**${passed} / ${scores.length} PASS**`,
    "",
    `Safety-critical failures: ${safetyFail.length}`,
    "",
    "| ID | Category | Severity | Result | Failures |",
    "|---|---|---|---|---|",
    ...scores.map((row) => `| ${row.caseId} | ${row.category} | ${row.severity} | ${row.result} | ${row.failures.join("; ").replace(/\|/g, "/")} |`),
    "",
  ];
  return lines.join("\n");
}
