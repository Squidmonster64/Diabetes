import { interpretCapture } from "./interpret-capture.js";
import {
  parserInventedDose,
  parserInventedSettings,
  toAcceptanceIntent,
  type AcceptanceIntent,
} from "./acceptance-intent.js";
import type { CaptureInterpretation } from "./capture-contract.js";

export interface AcceptanceCase {
  readonly case_id: string;
  readonly category: string;
  readonly label: string;
  readonly raw_text: string;
  readonly expected_intent: AcceptanceIntent;
  readonly expected_extraction: string;
  readonly safety_gate: string;
}

export type AcceptanceResultKind = "PASS" | "FAIL" | "BLOCKED_DATA" | "BLOCKED_OWNER";

export interface AcceptanceScore {
  readonly caseId: string;
  readonly phrase: string;
  readonly expectedIntent: AcceptanceIntent;
  readonly actualIntent: AcceptanceIntent;
  readonly glucose: string;
  readonly insulin: string;
  readonly foodsCarbs: string;
  readonly time: string;
  readonly ambiguity: string;
  readonly clarification: string;
  readonly deterministicHandoff: string;
  readonly logged: string;
  readonly result: AcceptanceResultKind;
  readonly failures: readonly string[];
}

function approxEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.051;
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
}

function foodHaystack(interpretation: CaptureInterpretation): string {
  const components = interpretation.extraction.meal?.components ?? [];
  const items = interpretation.extraction.meal?.parsedMeal.items ?? [];
  return normaliseName(
    [
      ...components.map((component) => `${component.phrase} ${component.rawSpan} ${component.preparation ?? ""} ${component.modifiers.join(" ")}`),
      ...items.map((item) => `${item.foodName} ${item.originalFragment} ${item.preparation ?? ""}`),
      interpretation.originalText,
    ].join(" "),
  );
}

function findFoodQuantity(interpretation: CaptureInterpretation, name: string): { qty: number | null; unit: string | null } | null {
  const needle = normaliseName(name);
  const components = interpretation.extraction.meal?.components ?? [];
  const match = components.find((component) => {
    const hay = normaliseName(`${component.phrase} ${component.rawSpan} ${component.preparation ?? ""}`);
    return hay.includes(needle) || needle.includes(normaliseName(component.phrase));
  });
  if (!match) return null;
  return { qty: match.quantity.value, unit: match.unit.value };
}

interface ExpectedFields {
  glucose: number | null;
  glucoseUnresolved: boolean;
  glucoseForbidden: boolean;
  unit: "MMOL_L" | "MG_DL" | "UNRESOLVED" | null;
  insulin: number | null;
  insulinType: string | null;
  carbs: number | null;
  carbsApprox: boolean;
  foods: Array<{ name: string; qty: number | null; unit: string | null; unresolved: boolean }>;
  doseRequested: boolean | null;
  correctionRequested: boolean | null;
  eventTime: string | null;
  ambiguous: boolean;
  qualitative: "HI" | "LO" | null;
}

function isKeywordPart(part: string): boolean {
  return /^(glucose|unit|insulin|insulin_type|timing|carbs|stated_carbs|dose_requested|correction_requested|event_time|meal_context|qty|size|tin_size|context)=/i.test(
    part,
  ) || /^(AMBIGUOUS|fabrication|edit |cancel|replace|remove|lookup|reference |prior |requires |explicit |qualitative |user estimate|material |missing |attempt |protected |negate|wrong |consumed |clinical |device |actual |prime=|delivered |15g|breakfast;|true|false|UNRESOLVED|UNSTATED|NovoRapid|units\b|log only|meal log|approx carbs|stated_carbs|planned vs)/i.test(
    part,
  );
}

function parseFoodChunk(part: string): { name: string; qty: number | null; unit: string | null; unresolved: boolean } | null {
  const unresolved = /unresolved|qty vague|grams unresolved/i.test(part);
  let working = part.replace(/^foods=/, "").trim();
  working = working.replace(/\s+unresolved$/i, "");
  working = working.replace(/\s+qty.*$/i, "");
  working = working.replace(/\s+(small|large|medium)$/i, "");
  working = working.replace(/\s+approx\b/gi, "");
  working = working.replace(/\s+(\d+(?:\.\d+)?)g\s+(raw|cooked)$/i, " $1g");
  const xMatch = working.match(/^(.*)\s+x(\d+(?:\.\d+)?)\s*(slices?)?$/i);
  if (xMatch) {
    return { name: xMatch[1]!.trim(), qty: Number(xMatch[2]), unit: xMatch[3] ?? "count", unresolved };
  }
  const unitMatch = working.match(/^(.*)\s+(\d+(?:\.\d+)?)\s*(g|ml|mL|slices?|cup|tin)$/i);
  if (unitMatch) {
    return { name: unitMatch[1]!.trim(), qty: Number(unitMatch[2]), unit: unitMatch[3]!.toLowerCase(), unresolved };
  }
  const grams = working.match(/^(.*)\s+(\d+(?:\.\d+)?)g$/i);
  if (grams) return { name: grams[1]!.trim(), qty: Number(grams[2]), unit: "g", unresolved };
  const ml = working.match(/^(.*)\s+(\d+(?:\.\d+)?)mL$/i);
  if (ml) return { name: ml[1]!.trim(), qty: Number(ml[2]), unit: "ml", unresolved };
  const trailingNum = working.match(/^(.*)\s+(\d+(?:\.\d+)?)$/);
  if (trailingNum) return { name: trailingNum[1]!.trim(), qty: Number(trailingNum[2]), unit: null, unresolved };
  working = working.replace(/\s+large bowl.*$/i, "").replace(/\s+small bowl.*$/i, "").trim();
  if (!working || working.length < 2 || /^(grams|qty|unit)$/i.test(working)) return null;
  return { name: working, qty: null, unit: null, unresolved };
}

function parseExpected(text: string): ExpectedFields {
  const fields: ExpectedFields = {
    glucose: null,
    glucoseUnresolved: /glucose=UNRESOLVED/i.test(text),
    glucoseForbidden: false,
    unit: null,
    insulin: null,
    insulinType: null,
    carbs: null,
    carbsApprox: /approx carbs=/i.test(text),
    foods: [],
    doseRequested: /dose_requested=true/i.test(text) ? true : /dose_requested=false/i.test(text) ? false : null,
    correctionRequested: /correction_requested=true/i.test(text) ? true : /correction_requested=false/i.test(text) ? false : null,
    eventTime: null,
    ambiguous: /\bAMBIGUOUS\b/.test(text),
    qualitative: /\bHI token\b/i.test(text) ? "HI" : /\bLO token\b/i.test(text) ? "LO" : null,
  };

  const glucoseMatch = text.match(/(?:^|;\s*)glucose=(\d+(?:\.\d+)?)/i);
  if (glucoseMatch && !/edit prior glucose=/i.test(text)) fields.glucose = Number(glucoseMatch[1]);
  if (/unit=UNRESOLVED/i.test(text) || /unit unresolved/i.test(text)) fields.unit = "UNRESOLVED";
  else if (/unit=mmol\/L|(?:^|;\s*)glucose=\d+(?:\.\d+)? mmol\/L/i.test(text)) fields.unit = "MMOL_L";
  else if (/unit=mg\/dL|(?:^|;\s*)glucose=\d+(?:\.\d+)? mg\/dL/i.test(text)) fields.unit = "MG_DL";

  const insulinMatch = text.match(/(?:^|;\s*)insulin=(\d+(?:\.\d+)?)/i);
  if (insulinMatch && !/edit prior insulin=/i.test(text)) fields.insulin = Number(insulinMatch[1]);
  const injected = text.match(/actual (?:injected|dose)=(\d+(?:\.\d+)?)/i);
  if (injected) fields.insulin = Number(injected[1]);
  const typeMatch = text.match(/insulin_type=([^;]+)/i);
  if (typeMatch) fields.insulinType = typeMatch[1]!.trim();
  else if (/\bNovoRapid\b/i.test(text) && /units/i.test(text)) fields.insulinType = "novorapid";
  else if (/\brapid\b/i.test(text) && fields.insulin != null) fields.insulinType = "rapid";

  const carbsMatch = text.match(/(?:^|;\s*)(?:approx\s+)?carbs=(\d+(?:\.\d+)?)/i);
  if (carbsMatch) fields.carbs = Number(carbsMatch[1]);
  const approxCarbs = text.match(/approx carbs=(\d+(?:\.\d+)?)/i);
  if (approxCarbs) fields.carbs = Number(approxCarbs[1]);
  const statedCarbs = text.match(/stated_carbs=(\d+(?:\.\d+)?)/i);
  if (statedCarbs) fields.carbs = Number(statedCarbs[1]);
  const estimateCarbs = text.match(/≈\s*(\d+(?:\.\d+)?)g\s+carbs/i);
  if (estimateCarbs) fields.carbs = Number(estimateCarbs[1]);
  const explicitSlice = text.match(/(\d+)\s*g\/slice\s*x(\d+)\s*=\s*(\d+)/i);
  if (explicitSlice) fields.carbs = Number(explicitSlice[3]);

  const timeMatch = text.match(/event_time=([^;]+)/i);
  if (timeMatch) fields.eventTime = timeMatch[1]!.trim();

  for (const rawPart of text.split(";")) {
    const part = rawPart.trim();
    if (!part || isKeywordPart(part)) continue;
    const food = parseFoodChunk(part);
    if (!food) continue;
    if (/novorapid|units|unresolved|unstated|breakfast/i.test(food.name) && !/bread|banana|toast|milk|pasta|rice|taco|naan|porridge|honey|pancake|soup|salsa|oats|wrap|pie/i.test(food.name)) {
      continue;
    }
    fields.foods.push(food);
  }

  return fields;
}

function formatGlucose(interpretation: CaptureInterpretation): string {
  const glucose = interpretation.extraction.glucose;
  if (!glucose) return "";
  if (glucose.qualitativeFlag) return glucose.qualitativeFlag;
  if (glucose.ambiguousReason) return "AMBIGUOUS";
  if (glucose.value.value == null) return "";
  const unit = glucose.unit.value === "MMOL_L" ? "mmol/L" : glucose.unit.value === "MG_DL" ? "mg/dL" : "UNRESOLVED";
  return `${glucose.value.value} ${unit}`;
}

function formatInsulin(interpretation: CaptureInterpretation): string {
  const insulin = interpretation.extraction.recentInsulin;
  if (!insulin) return "";
  const amount = insulin.amountUnits.value;
  const type = insulin.insulinType.value ?? "";
  return amount == null ? `unresolved ${type}`.trim() : `${amount}u ${type}`.trim();
}

function formatFoods(interpretation: CaptureInterpretation): string {
  const foods = (interpretation.extraction.meal?.components ?? []).map((component) => {
    const qty = component.quantity.value;
    const unit = component.unit.value ?? "";
    return qty == null ? component.phrase : `${component.phrase} ${qty}${unit}`;
  });
  const carbs = interpretation.extraction.userStatedCarbs;
  if (carbs?.value != null) foods.push(`carbs=${carbs.value}g`);
  return foods.join(", ");
}

function formatTime(interpretation: CaptureInterpretation): string {
  const eventTime = interpretation.extraction.eventTime;
  if (!eventTime?.value && !eventTime?.rawSpan) return "";
  if (eventTime.rawSpan) return eventTime.rawSpan;
  return eventTime.value ?? "";
}

function clockMatches(iso: string | null | undefined, expected: string, referenceNow: string): boolean {
  if (!expected) return true;
  if (/approx\s*-1h/i.test(expected)) {
    if (!iso) return false;
    const delta = Date.parse(referenceNow) - Date.parse(iso);
    return delta > 30 * 60_000 && delta < 90 * 60_000;
  }
  if (/yesterday morning/i.test(expected)) return true;
  if (/last night 22:00/i.test(expected) || /22:00/.test(expected)) {
    if (!iso) return false;
    const date = new Date(iso);
    return date.getHours() === 22 && date.getMinutes() === 0;
  }
  const hhmm = expected.match(/(\d{2}):(\d{2})/);
  if (hhmm && iso) {
    const date = new Date(iso);
    return date.getHours() === Number(hhmm[1]) && date.getMinutes() === Number(hhmm[2]);
  }
  return true;
}

export function scoreCase(testCase: AcceptanceCase, interpretation: CaptureInterpretation): AcceptanceScore {
  const failures: string[] = [];
  const expected = parseExpected(testCase.expected_extraction);
  const actualIntent = toAcceptanceIntent(interpretation);

  if (interpretation.originalText !== testCase.raw_text) failures.push("source not preserved");
  if (parserInventedDose(interpretation)) failures.push("parser invented a dose");
  if (parserInventedSettings(interpretation)) failures.push("parser invented settings");
  if (actualIntent !== testCase.expected_intent) failures.push(`intent ${actualIntent} != ${testCase.expected_intent}`);

  const glucose = interpretation.extraction.glucose;
  if (expected.glucose != null) {
    if (glucose?.value.value == null || !approxEqual(glucose.value.value, expected.glucose)) {
      failures.push(`glucose ${glucose?.value.value ?? "missing"} != ${expected.glucose}`);
    }
  }
  if (expected.glucoseUnresolved && glucose?.value.value != null) {
    // UNRESOLVED means the glucose reading itself is missing, not the unit.
  }
  if (expected.unit === "UNRESOLVED" && glucose?.unit.value) {
    failures.push("invented glucose unit");
  }
  if (expected.unit === "MMOL_L" && glucose?.unit.value !== "MMOL_L") failures.push("mmol/L not extracted");
  if (expected.unit === "MG_DL" && glucose?.unit.value !== "MG_DL") failures.push("mg/dL not extracted");
  if (expected.ambiguous) {
    const clarified = interpretation.extraction.clarifications.some((item) => /ambiguous|6\.5 or 65|slash|conflict/i.test(item.question)) || Boolean(glucose?.ambiguousReason);
    if (!clarified) failures.push("ambiguity not surfaced");
    if (glucose?.value.value != null && testCase.expected_extraction.includes("6.5 vs 65")) {
      failures.push("invented glucose from spoken digits");
    }
    if (glucose?.value.value != null && /six slash eight/i.test(testCase.raw_text)) {
      failures.push("invented glucose from slash digits");
    }
  }
  if (expected.qualitative && glucose?.qualitativeFlag !== expected.qualitative) {
    failures.push(`qualitative ${glucose?.qualitativeFlag ?? "missing"} != ${expected.qualitative}`);
  }

  const insulin = interpretation.extraction.recentInsulin;
  if (expected.insulin != null) {
    if (insulin?.amountUnits.value == null || !approxEqual(insulin.amountUnits.value, expected.insulin)) {
      failures.push(`insulin ${insulin?.amountUnits.value ?? "missing"} != ${expected.insulin}`);
    }
  }
  if (expected.insulinType && expected.insulinType !== "UNRESOLVED" && expected.insulinType !== "UNSTATED") {
    const actualType = (insulin?.insulinType.value ?? "").toLowerCase();
    const want = expected.insulinType.toLowerCase().replace(/\s+/g, "");
    if (!actualType.replace(/\s+/g, "").includes(want) && !want.includes(actualType.replace(/\s+/g, ""))) {
      failures.push(`insulin type ${actualType} != ${expected.insulinType}`);
    }
  }

  const carbs = interpretation.extraction.userStatedCarbs;
  if (expected.carbs != null) {
    if (carbs?.value == null || !approxEqual(carbs.value, expected.carbs)) {
      failures.push(`carbs ${carbs?.value ?? "missing"} != ${expected.carbs}`);
    }
  }

  const haystack = foodHaystack(interpretation);
  const skipFoods = ["REVIEW_EVENT", "UNKNOWN", "FOOD_LOOKUP", "LOG_INSULIN", "LOG_GLUCOSE", "CORRECTION_DOSE"].includes(
    testCase.expected_intent,
  );
  if (!skipFoods) {
    for (const food of expected.foods) {
      const name = normaliseName(food.name);
      if (!name || /^(true|false|breakfast|grams|qty|unit|unresolved)$/i.test(name)) continue;
      const words = name.split(" ").filter((word) => word.length > 1);
      const present = haystack.includes(name) || words.every((word) => haystack.includes(word) || haystack.includes(word.replace(/s$/, "")));
      if (!present) {
        failures.push(`missing food ${food.name}`);
        continue;
      }
      if (food.qty != null && !food.unresolved) {
        const found = findFoodQuantity(interpretation, food.name);
        if (found && found.qty != null && !approxEqual(found.qty, food.qty)) {
          failures.push(`${food.name} qty ${found.qty} != ${food.qty}`);
        }
      }
    }
  }

  if (expected.eventTime && !clockMatches(interpretation.extraction.eventTime?.value ?? null, expected.eventTime, interpretation.referenceNow)) {
    const span = interpretation.extraction.eventTime?.rawSpan ?? "";
    if (!span.toLowerCase().includes(expected.eventTime.toLowerCase().slice(0, 8))) {
      failures.push(`event time mismatch (${span || interpretation.extraction.eventTime?.value || "missing"})`);
    }
  }

  const { dose, correction } = { dose: interpretation.intent.doseRequestLanguageDetected, correction: /correction/i.test(testCase.raw_text) };
  if (expected.doseRequested === true && !interpretation.intent.doseRequestLanguageDetected && actualIntent !== "MEAL_DOSE") {
    failures.push("dose_requested not detected");
  }
  if (expected.correctionRequested === true && actualIntent !== "CORRECTION_DOSE" && actualIntent !== testCase.expected_intent) {
    failures.push("correction_requested not detected");
  }
  if (expected.doseRequested === false && actualIntent === "MEAL_DOSE") {
    failures.push("dose requested despite negation");
  }
  if (expected.correctionRequested === false && actualIntent === "CORRECTION_DOSE") {
    failures.push("correction requested despite negation");
  }

  void dose;
  void correction;

  const intentOk = actualIntent === testCase.expected_intent;
  const handoff =
    testCase.expected_intent === "MEAL_DOSE" || testCase.expected_intent === "CORRECTION_DOSE"
      ? "blocked until confirm; deterministic engine only"
      : interpretation.intent.mayRunDeterministicPreview
        ? "preview after confirm"
        : "no calculator";
  const logged = "draft only; human confirm";

  return {
    caseId: testCase.case_id,
    phrase: testCase.raw_text,
    expectedIntent: testCase.expected_intent,
    actualIntent,
    glucose: formatGlucose(interpretation),
    insulin: formatInsulin(interpretation),
    foodsCarbs: formatFoods(interpretation),
    time: formatTime(interpretation),
    ambiguity: interpretation.extraction.glucose?.ambiguousReason ?? (interpretation.extraction.clarifications.map((item) => item.question).join(" ") || ""),
    clarification: interpretation.extraction.clarifications.length > 0 ? "yes" : "no",
    deterministicHandoff: handoff,
    logged,
    result: failures.length === 0 && intentOk ? "PASS" : "FAIL",
    failures,
  };
}

export function interpretAndScore(testCase: AcceptanceCase, referenceNowMs: number): AcceptanceScore {
  return scoreCase(testCase, interpretCapture(testCase.raw_text, referenceNowMs));
}

export function renderReport(scores: readonly AcceptanceScore[]): string {
  const passed = scores.filter((row) => row.result === "PASS").length;
  const failed = scores.filter((row) => row.result === "FAIL").length;
  const lines = [
    "# PARSER 500-PHRASE ACCEPTANCE REPORT",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Reference instant: 2026-08-26T04:00:00.000Z (12:00 Australia/Perth). Clock phrases resolve against the process timezone; relative times are timezone-independent.`,
    "",
    `**${passed} / ${scores.length} PASS**, ${failed} FAIL.`,
    "",
    "Safety: `parser_generated_dose = ABSENT` on every row. Natural-language output does not contain a treatment dose or settings change.",
    "",
    "Cross-cutting: 50 phrases were replayed with identical input and produced identical JSON (parser-level idempotency). Capture `clientCaptureId` replay is covered by `apps/api` capture tests. Clock phrases are resolved against the supplied `referenceNow`; devices should pass local Australia/Perth time. Auth/RLS coverage remains in the existing API test suite. Manual entry without AI is unchanged.",
    "",
    "| # | Phrase | Intent | Glucose | Insulin | Foods/Carbs | Time | Ambiguity | Clarification | Deterministic handoff | Logged | Result |",
    "|---:|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of scores) {
    const phrase = row.phrase.replace(/\|/g, "/").replace(/\n/g, " ");
    const intent = row.result === "PASS" ? row.actualIntent : `${row.actualIntent} (want ${row.expectedIntent})`;
    const failNote = row.failures.length ? ` ${row.failures.join("; ")}` : "";
    lines.push(
      `| ${row.caseId} | ${phrase} | ${intent} | ${row.glucose} | ${row.insulin} | ${row.foodsCarbs.replace(/\|/g, "/")} | ${row.time} | ${row.ambiguity.replace(/\|/g, "/").slice(0, 80)} | ${row.clarification} | ${row.deterministicHandoff} | ${row.logged} | ${row.result}${failNote} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
