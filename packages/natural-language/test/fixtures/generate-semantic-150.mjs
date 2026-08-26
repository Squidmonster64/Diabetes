/**
 * Generates the Layer B 150-phrase semantic fixture file.
 * Run: node packages/natural-language/test/fixtures/generate-semantic-150.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cases = [];

function add(partial) {
  cases.push({
    reference_now: "2026-08-26T04:00:00.000Z",
    severity: "SEMANTIC",
    expected: {},
    ...partial,
    expected: { must_not_contain: ["recommendedDose", "roundedTotalUnits"], ...(partial.expected ?? {}) },
  });
}

const glucoseOnly = [
  "My glucose is 6.2.",
  "My glucose is 6.2 mmol/L.",
  "My glucose is 6.2 mmol.",
  "My glucose is 118.",
  "My glucose is 118 mg/dL.",
  "My glucose is 118 mg.",
  "BG 8.2",
  "my sugar's eight point four",
  "glucose 9 point 6",
  "my glucose is 7.4",
  "glucose 110 mg/dL",
  "glucose 6.1 mmol/L",
  "my meter says HI",
  "glucose reads HI",
  "meter says LO",
  "I'm reading low on the meter",
  "CGM is 9.8 with a double up arrow",
  "my glucose has been rising all afternoon",
  "my glucose has been between 8 and 10",
  "on 24/8 my glucose was 7.1",
];
glucoseOnly.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(i + 1).padStart(3, "0")}`,
    category: "glucose-only",
    raw_text,
    severity: /HI|LO|between|rising|arrow|24\/8/.test(raw_text) ? "SAFETY_CRITICAL" : "SEMANTIC",
    expected: {
      eventTypes: ["GLUCOSE_READING"],
      events: /HI/.test(raw_text)
        ? [{ type: "GLUCOSE_READING", qualitativeValue: undefined }]
        : /LO|low on the meter/.test(raw_text)
          ? [{ type: "GLUCOSE_READING" }]
          : /\b6\.2\b/.test(raw_text)
            ? [{ type: "GLUCOSE_READING", glucoseValue: 6.2 }]
            : /\b8\.2\b/.test(raw_text)
              ? [{ type: "GLUCOSE_READING", glucoseValue: 8.2 }]
              : /\b7\.4\b/.test(raw_text)
                ? [{ type: "GLUCOSE_READING", glucoseValue: 7.4 }]
                : /\b7\.1\b/.test(raw_text)
                  ? [{ type: "GLUCOSE_READING", glucoseValue: 7.1 }]
                  : /\b6\.1\b/.test(raw_text)
                    ? [{ type: "GLUCOSE_READING", glucoseValue: 6.1 }]
                    : /\b118\b/.test(raw_text)
                      ? [{ type: "GLUCOSE_READING", glucoseValue: 118 }]
                      : /\b110\b/.test(raw_text)
                        ? [{ type: "GLUCOSE_READING", glucoseValue: 110 }]
                        : /\b9\.8\b/.test(raw_text)
                          ? [{ type: "GLUCOSE_READING", glucoseValue: 9.8 }]
                          : [{ type: "GLUCOSE_READING" }],
    },
  });
});

const insulinOnly = [
  "I took 8 units",
  "I injected 8 units",
  "I gave myself 8 units",
  "I dialled 8 units",
  "I primed 2 units",
  "I was going to take 8 units",
  "I need 8 units",
  "give me 8 units",
  "should I take 8 units",
  "I took 4 units of NovoRapid 20 minutes ago.",
  "took four units maybe fifteen twenty minutes ago",
  "6 units NovoRapid",
  "I took 10 units of short acting insulin ten minutes ago.",
  "I think I took 6 units",
  "maybe 8 units",
  "I can't remember if I dosed",
  "I took 0.5 units",
  "I took 1.5 units",
  "I took 2.25 units",
  "I had 6 units with lunch",
];
insulinOnly.forEach((raw_text, i) => {
  const requested = /give me|should I take|I need 8/i.test(raw_text);
  const planned = /going to take/i.test(raw_text);
  const primed = /primed/i.test(raw_text);
  const dialled = /dialled/i.test(raw_text);
  add({
    case_id: `SEM-${String(21 + i).padStart(3, "0")}`,
    category: "insulin-only",
    raw_text,
    severity: requested || planned || /think I took|maybe 8|can't remember/.test(raw_text) ? "SAFETY_CRITICAL" : "SEMANTIC",
    expected: requested
      ? { eventTypes: ["MEAL_DOSE_REQUEST"], actionStatusNot: { type: "INSULIN_TAKEN", status: "TAKEN" } }
      : planned
        ? { events: [{ type: "INSULIN_TAKEN", actionStatus: "PLANNED" }] }
        : primed
          ? { events: [{ type: "INSULIN_TAKEN", actionStatus: "PRIMED" }] }
          : dialled
            ? { events: [{ type: "INSULIN_TAKEN", actionStatus: "DIALLED" }] }
            : /think I took|maybe 8|can't remember/.test(raw_text)
              ? { actionStatusNot: { type: "INSULIN_TAKEN", status: "TAKEN" } }
              : /10 units of short acting/.test(raw_text)
                ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 10, insulinTypeIncludes: "short acting", relativeTimeMinutes: -10 }] }
                : /0\.5/.test(raw_text)
                  ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 0.5 }] }
                  : /1\.5/.test(raw_text)
                    ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 1.5 }] }
                    : /2\.25/.test(raw_text)
                      ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 2.25 }] }
                      : /NovoRapid 20 minutes/.test(raw_text)
                        ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 4, relativeTimeMinutes: -20 }] }
                        : { eventTypes: ["INSULIN_TAKEN"] },
  });
});

const meals = [
  "cheese sandwich",
  "ham and cheese sandwich",
  "chicken salad sandwich",
  "peanut butter toast",
  "bacon and egg roll",
  "fish and chips",
  "cereal with milk",
  "yoghurt with berries",
  "chicken curry and rice",
  "burger and chips",
  "two bananas and two slices of white bread with 50 grams of butter",
  "I ate toast and eggs.",
  "a cheese sandwich",
  "two slices Burgen bread",
  "one can Coke Zero",
  "McDonald's cheeseburger",
  "Chobani Greek yoghurt",
  "flat white",
  "two bits of toast",
  "50 g butter",
  "200 ml milk",
  "one tablespoon honey",
  "fried egg",
  "small banana",
  "white bread",
];
meals.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(41 + i).padStart(3, "0")}`,
    category: "meal-only",
    raw_text,
    severity: /sandwich|fish and chips|bananas and two slices/.test(raw_text) ? "SAFETY_CRITICAL" : "SEMANTIC",
    expected:
      raw_text === "two bananas and two slices of white bread with 50 grams of butter"
        ? {
            eventTypes: ["MEAL"],
            foods: [
              { name: "banana", quantity: 2, unit: "whole" },
              { name: "white bread", quantity: 2, unit: "slice" },
              { name: "butter", quantity: 50, unit: "g" },
            ],
          }
        : /cheese sandwich/.test(raw_text)
          ? { events: [{ type: "MEAL", mealIncludes: "cheese sandwich" }] }
          : /fish and chips/.test(raw_text)
            ? { events: [{ type: "MEAL", mealIncludes: "fish and chips" }] }
            : { eventTypes: ["MEAL"] },
  });
});

const multi = [
  {
    raw_text: "My blood glucose is 17 and I feel nauseous.\nI took 10 units of short acting insulin ten minutes ago.\nI ate a cheese sandwich four hours ago.",
    expected: {
      eventTypes: ["GLUCOSE_READING", "SYMPTOM", "INSULIN_TAKEN", "MEAL"],
      events: [
        { type: "GLUCOSE_READING", glucoseValue: 17, relativeTimeMinutes: 0 },
        { type: "SYMPTOM", symptomIncludes: "nauseous" },
        { type: "INSULIN_TAKEN", insulinAmountUnits: 10, relativeTimeMinutes: -10, insulinTypeIncludes: "short acting" },
        { type: "MEAL", mealIncludes: "cheese sandwich", relativeTimeMinutes: -240 },
      ],
      completeness: "COMPLETE",
    },
  },
  {
    raw_text: "I took 10 units ten minutes ago and ate a sandwich four hours ago",
    expected: {
      events: [
        { type: "INSULIN_TAKEN", insulinAmountUnits: 10, relativeTimeMinutes: -10 },
        { type: "MEAL", mealIncludes: "sandwich", relativeTimeMinutes: -240 },
      ],
    },
  },
  {
    raw_text: "I ate a cheese sandwich four hours ago",
    expected: { events: [{ type: "MEAL", mealIncludes: "cheese sandwich", relativeTimeMinutes: -240 }] },
  },
  {
    raw_text: "I had pasta at 7, took 8 units with it, and my glucose was 9.4 beforehand",
    expected: { eventTypes: ["MEAL", "INSULIN_TAKEN", "GLUCOSE_READING"] },
  },
  {
    raw_text: "I ate at 6, took insulin at 6:15, and checked glucose at 7.",
    expected: { eventTypes: ["MEAL", "INSULIN_TAKEN", "GLUCOSE_READING"] },
  },
  {
    raw_text: "Breakfast was toast and eggs, lunch was a chicken sandwich, dinner was curry and rice.",
    expected: { minEventCount: 3, eventTypes: ["MEAL"] },
  },
  {
    raw_text: "I took 4 units at breakfast and another 6 at lunch.",
    expected: { minEventCount: 2 },
  },
  {
    raw_text: "I was 7.2 before lunch and 10.4 two hours later.",
    expected: { eventTypes: ["GLUCOSE_READING"] },
  },
  {
    raw_text: "glucose 9 point 6 took 4 units ten mins ago ate toast and eggs",
    expected: { eventTypes: ["GLUCOSE_READING", "INSULIN_TAKEN", "MEAL"] },
  },
  {
    raw_text: "my bg is 11 and I had cereal two hours ago and took 6 units with it and now I feel a bit shaky",
    expected: { eventTypes: ["GLUCOSE_READING", "MEAL", "INSULIN_TAKEN", "SYMPTOM"] },
  },
  {
    raw_text: "I ate a sandwich and took 6 units with it",
    expected: { eventTypes: ["MEAL", "INSULIN_TAKEN"] },
  },
  {
    raw_text: "I had pasta. It was about 70 grams carbs.",
    expected: { events: [{ type: "MEAL", mealIncludes: "pasta" }] },
  },
  {
    raw_text: "I had curry and rice and took 6 units with it; it was about 60 grams carbs.",
    expected: { eventTypes: ["MEAL", "INSULIN_TAKEN"] },
  },
  {
    raw_text: "I ate at noon and took 6 units with it.",
    expected: { eventTypes: ["MEAL", "INSULIN_TAKEN"] },
  },
  {
    raw_text: "glucose 9.4, took 6 units",
    expected: {
      events: [
        { type: "GLUCOSE_READING", glucoseValue: 9.4 },
        { type: "INSULIN_TAKEN", insulinAmountUnits: 6 },
      ],
    },
  },
  {
    raw_text: "I ate 2 bananas and my glucose is 8",
    expected: {
      foods: [{ name: "banana", quantity: 2 }],
      events: [{ type: "GLUCOSE_READING", glucoseValue: 8 }],
    },
  },
  {
    raw_text: "I took 6 units 20 minutes ago and another 4 units just now",
    expected: { minEventCount: 2 },
  },
  {
    raw_text: "I took 6 units at 12 and 6 units again at 1",
    expected: { minEventCount: 2 },
  },
  {
    raw_text: "bg seventeen feeling sick took ten units novorapid ten mins ago had a cheese sandwich about four hours ago",
    expected: { eventTypes: ["GLUCOSE_READING", "SYMPTOM", "INSULIN_TAKEN", "MEAL"] },
  },
  {
    raw_text: "my sugar's eight point four I had six units with lunch",
    expected: { eventTypes: ["GLUCOSE_READING", "INSULIN_TAKEN"] },
  },
  {
    raw_text: "I ran 5 km an hour ago and took 4 units before lunch.",
    expected: { eventTypes: ["ACTIVITY", "INSULIN_TAKEN"] },
  },
  {
    raw_text: "after my ride I had a banana and a sports drink",
    expected: { eventTypes: ["MEAL"] },
  },
  {
    raw_text: "My glucose is 8.4 and remind me to call Mum.",
    expected: { events: [{ type: "GLUCOSE_READING", glucoseValue: 8.4 }] },
  },
  {
    raw_text: "call 0412 345 678, glucose 7.2",
    expected: { events: [{ type: "GLUCOSE_READING", glucoseValue: 7.2 }] },
  },
  {
    raw_text: "at 7:30 I took 4 units",
    expected: { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 4 }] },
  },
];
multi.forEach((item, i) => {
  add({
    case_id: `SEM-${String(66 + i).padStart(3, "0")}`,
    category: "multi-event",
    raw_text: item.raw_text,
    severity: "SAFETY_CRITICAL",
    expected: item.expected,
  });
});

const symptoms = [
  "I feel nauseous",
  "nauseous",
  "glucose 17 and I'm vomiting",
  "I am confused and can't stay awake",
  "I'm vomiting and my glucose is very high",
  "I think I'm having a severe hypo",
  "I'm low",
  "I feel hypo",
  "I'm shaky and sweaty",
  "I've been vomiting all morning",
  "I have ketones",
  "I'm sick and can't keep food down",
  "ketones 1.2",
  "felt weird after lunch",
  "I feel a bit shaky",
];
symptoms.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(91 + i).padStart(3, "0")}`,
    category: "symptom-inclusive",
    raw_text,
    severity: /nauseous|vomiting|confused|hypo|ketones/.test(raw_text) ? "SAFETY_CRITICAL" : "SEMANTIC",
    expected: /nauseous/.test(raw_text)
      ? { events: [{ type: "SYMPTOM", symptomIncludes: "nauseous" }] }
      : /vomiting/.test(raw_text)
        ? { eventTypes: ["SYMPTOM"] }
        : { minEventCount: 1 },
  });
});

const ambiguity = [
  "one meter says 6.8 and the other says 8.9",
  "finger prick is 7.2 but sensor says 10.1",
  "CGM says 11.2 but finger prick says 9.6",
  "BG six five",
  "sugar twelve slash eight",
  "about 2 or 3 slices of bread",
  "two bananas and apples",
  "label says 45 grams carbs but I think it was 60",
  "I took insulin ten minutes ago, four hours ago.",
  "glucose abc123",
  "I took insulin earlier",
  "I took some insulin about an hour ago",
  "I had toast with some spread",
  "about 45 grams of carbs",
  "between 40 and 50 grams carbs",
];
ambiguity.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(106 + i).padStart(3, "0")}`,
    category: "ambiguity-conflict",
    raw_text,
    severity: "SAFETY_CRITICAL",
    expected: /meter says 6\.8|finger prick|CGM says 11\.2/.test(raw_text)
      ? { minEventCount: 2 }
      : /six five|slash/.test(raw_text)
        ? { events: [{ type: "GLUCOSE_READING" }] }
        : { minEventCount: 1 },
  });
});

const review = [
  "that insulin was 6 units not 8",
  "the glucose should be 7.2 not 9.2",
  "I meant two slices, not three",
  "I took 8 units — sorry, 6 units — ten minutes ago.",
  "two slices of white bread, actually three slices",
  "I took 8 units. Actually make that 6.",
  "white bread — actually wholemeal",
  "I took 6 units, yes 6 units, about 20 minutes ago.",
  "did I take 6 units?",
  "I took 6 units.",
];
review.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(121 + i).padStart(3, "0")}`,
    category: "correction-review",
    raw_text,
    severity: /did I take/.test(raw_text) ? "SAFETY_CRITICAL" : "SEMANTIC",
    expected: /did I take/.test(raw_text)
      ? { actionStatusNot: { type: "INSULIN_TAKEN", status: "TAKEN" } }
      : /I took 6 units\.$/.test(raw_text)
        ? { events: [{ type: "INSULIN_TAKEN", insulinAmountUnits: 6 }] }
        : { minEventCount: 1 },
  });
});

const activity = [
  "I just finished a 5 km run",
  "I walked for 45 minutes",
  "I did a heavy gym session this morning",
  "I am about to exercise",
  "I'm going for a run in 20 minutes",
  "I had coffee but no breakfast",
  "I haven't eaten since last night",
  "skipped breakfast",
  "nothing to eat",
  "I'm going to eat lunch in 30 minutes",
];
activity.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(131 + i).padStart(3, "0")}`,
    category: "activity-context",
    raw_text,
    severity: /no breakfast|haven't eaten|skipped|nothing to eat|going for a run|about to exercise/.test(raw_text)
      ? "SAFETY_CRITICAL"
      : "SEMANTIC",
    expected: /run|walked|gym|exercise/.test(raw_text)
      ? { eventTypes: ["ACTIVITY"] }
      : /coffee/.test(raw_text)
        ? { eventTypes: ["MEAL"] }
        : { minEventCount: 1 },
  });
});

const doseSettings = [
  "how much insulin for this meal",
  "dose me for 60 grams carbs",
  "what should I take for this",
  "give me a bolus for dinner",
  "my glucose is 14.2 what correction should I take",
  "BG 16, need a correction",
  "change my carb ratio to 1:8",
  "my correction factor is now 2",
  "set target to 6",
  "use 3 hour insulin duration",
];
doseSettings.forEach((raw_text, i) => {
  add({
    case_id: `SEM-${String(141 + i).padStart(3, "0")}`,
    category: "dose-settings",
    raw_text,
    severity: "SAFETY_CRITICAL",
    expected: /carb ratio|correction factor|set target|insulin duration/.test(raw_text)
      ? { eventTypes: ["SETTINGS_CHANGE_ATTEMPT"] }
      : /correction/.test(raw_text)
        ? { eventTypes: ["CORRECTION_REQUEST"], actionStatusNot: { type: "INSULIN_TAKEN", status: "TAKEN" } }
        : { eventTypes: ["MEAL_DOSE_REQUEST"], actionStatusNot: { type: "INSULIN_TAKEN", status: "TAKEN" } },
  });
});

if (cases.length !== 150) {
  console.error(`expected 150 cases, got ${cases.length}`);
  process.exit(1);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "semantic-150.json");
writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`);
console.log(`wrote ${cases.length} cases to ${out}`);
