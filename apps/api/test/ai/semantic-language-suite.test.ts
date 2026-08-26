process.env.TZ = "Australia/Perth";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { interpretCapture, type SemanticCase, scoreSemanticCase, renderSemanticReport } from "@diabetes-companion/natural-language";
import { overlayLanguageModelCapture } from "../../src/ai/interpretLanguage.js";
import { DIABETES_EVENT_JSON_SCHEMA } from "../../src/ai/schemas.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "../../../../packages/natural-language/test/fixtures/semantic-150.json");
const REPORT = path.join(HERE, "../../../../audit/PARSER_SEMANTIC_REPORT.md");
const LIVE = Boolean(process.env.OPENAI_API_KEY && process.env.LIVE_SEMANTIC_SUITE === "1");

const cases = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as SemanticCase[];

afterEach(() => {
  // Layer B always goes through overlayLanguageModelCapture. CI has no key.
});

describe("SEMANTIC LANGUAGE SUITE (Layer B)", () => {
  it("covers 150 phrases with the required distribution", () => {
    expect(cases).toHaveLength(150);
    const counts = Object.fromEntries(
      ["glucose-only", "insulin-only", "meal-only", "multi-event", "symptom-inclusive", "ambiguity-conflict", "correction-review", "activity-context", "dose-settings"].map((category) => [
        category,
        cases.filter((testCase) => testCase.category === category).length,
      ]),
    );
    expect(counts["glucose-only"]).toBe(20);
    expect(counts["insulin-only"]).toBe(20);
    expect(counts["meal-only"]).toBe(25);
    expect(counts["multi-event"]).toBe(25);
    expect(counts["symptom-inclusive"]).toBe(15);
    expect(counts["ambiguity-conflict"]).toBe(15);
    expect(counts["correction-review"]).toBe(10);
    expect(counts["activity-context"]).toBe(10);
    expect(counts["dose-settings"]).toBe(10);
  });

  it("production schema includes an ordered events collection and omits dose keys", () => {
    const props = DIABETES_EVENT_JSON_SCHEMA.properties as Record<string, unknown>;
    expect(props.events).toBeDefined();
    expect(props.recommendedDose).toBeUndefined();
    expect(props.insulinDose).toBeUndefined();
  });

  it("scores every case through overlayLanguageModelCapture used by POST /api/v1/captures", async () => {
    const scores = [];
    for (const testCase of cases) {
      const referenceNow = Date.parse(testCase.reference_now ?? "2026-08-26T04:00:00.000Z");
      const interpretation = interpretCapture(testCase.raw_text, referenceNow);
      const overlayed = await overlayLanguageModelCapture(interpretation, {
        apiKey: LIVE ? process.env.OPENAI_API_KEY : undefined,
        interpretationModel: process.env.OPENAI_INTERPRETATION_MODEL,
      });
      scores.push(scoreSemanticCase(testCase, overlayed));
    }
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, renderSemanticReport(scores));
    const failed = scores.filter((row) => row.result !== "PASS");
    const safetyFailed = failed.filter((row) => cases.find((testCase) => testCase.case_id === row.caseId)?.severity === "SAFETY_CRITICAL");
    if (failed.length > 0) {
      const preview = failed
        .slice(0, 40)
        .map((row) => `${row.caseId} ${row.severity} ${row.failures.join("; ")}`)
        .join("\n");
      expect.fail(`${failed.length} failures (${safetyFailed.length} safety-critical)\n${preview}`);
    }
    expect(scores.filter((row) => row.result === "PASS")).toHaveLength(150);
  });
});
