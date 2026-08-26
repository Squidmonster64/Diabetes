process.env.TZ = "UTC";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { interpretCapture } from "../src/interpret-capture.js";
import { interpretAndScore, renderReport, type AcceptanceCase } from "../src/score-acceptance.js";
import { parserInventedDose } from "../src/acceptance-intent.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "diabetes-500.json");
const REPORT = path.join(HERE, "..", "..", "..", "audit", "PARSER_500_REPORT.md");
/** Noon Australia/Perth on 26 Aug 2026, supplied as UTC. */
const REFERENCE_NOW = Date.parse("2026-08-26T04:00:00.000Z");

const cases = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as AcceptanceCase[];

describe("500-phrase parser acceptance", () => {
  const scores = cases.map((testCase) => interpretAndScore(testCase, REFERENCE_NOW));

  it("writes the required 500-row report", () => {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, renderReport(scores));
    expect(fs.existsSync(REPORT)).toBe(true);
  });

  it("covers all 500 phrases", () => {
    expect(cases).toHaveLength(500);
    expect(scores).toHaveLength(500);
  });

  it("never invents a parser-generated dose", () => {
    for (const testCase of cases) {
      const interpretation = interpretCapture(testCase.raw_text, REFERENCE_NOW);
      expect(parserInventedDose(interpretation), testCase.case_id).toBe(false);
      expect(interpretation.originalText).toBe(testCase.raw_text);
    }
  });

  it("is deterministic across a 50-case replay", () => {
    const sample = cases.filter((_, index) => index % 10 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(50);
    for (const testCase of sample) {
      const first = JSON.stringify(interpretCapture(testCase.raw_text, REFERENCE_NOW));
      const second = JSON.stringify(interpretCapture(testCase.raw_text, REFERENCE_NOW));
      expect(second, testCase.case_id).toBe(first);
    }
  });

  it("passes 500 / 500 phrase cases", () => {
    const failed = scores.filter((row) => row.result !== "PASS");
    if (failed.length > 0) {
      const preview = failed
        .slice(0, 40)
        .map((row) => `${row.caseId} ${row.expectedIntent} vs ${row.actualIntent}: ${row.failures.join("; ")}`)
        .join("\n");
      expect.fail(`${failed.length} failures\n${preview}`);
    }
    expect(scores.filter((row) => row.result === "PASS")).toHaveLength(500);
  });
});
