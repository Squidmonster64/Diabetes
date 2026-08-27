process.env.TZ = "Australia/Perth";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  interpretCapture,
  SEMANTIC_PARSER_VERSION,
  type SemanticCase,
  type SemanticLiveRunMeta,
  scoreSemanticCase,
  renderSemanticReport,
} from "@diabetes-companion/natural-language";
import { overlayLanguageModelCapture } from "../../src/ai/interpretLanguage.js";
import { DIABETES_EVENT_JSON_SCHEMA } from "../../src/ai/schemas.js";
import {
  DEFAULT_INTERPRETATION_MODEL,
  DIABETES_EVENT_PROMPT_VERSION,
  DIABETES_EVENT_SCHEMA_NAME,
} from "../../src/ai/versions.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "../../../../packages/natural-language/test/fixtures/semantic-150.json");
const REPORT = path.join(HERE, "../../../../audit/PARSER_SEMANTIC_REPORT.md");
const LIVE = Boolean(process.env.OPENAI_API_KEY && process.env.LIVE_SEMANTIC_SUITE === "1");
const LIVE_TIMEOUT_MS = 45 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = [2_000, 4_000, 8_000];
/** Published chat-model list rates used only for the suite cost estimate. */
const USD_PER_MILLION_PROMPT = 0.15;
const USD_PER_MILLION_COMPLETION = 0.6;

const cases = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as SemanticCase[];

afterEach(() => {
  // Layer B always goes through overlayLanguageModelCapture. CI has no key.
});

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function latencySummary(samples: readonly number[]): SemanticLiveRunMeta["latencyMs"] {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length);
  return {
    min: sorted[0]!,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]!,
    mean,
  };
}

function auditModelLabel(model: string | null | undefined): string | null {
  if (!model) return null;
  const configured = DEFAULT_INTERPRETATION_MODEL;
  if (model === configured) return "DEFAULT_INTERPRETATION_MODEL";
  if (model.startsWith(`${configured}-`)) return `DEFAULT_INTERPRETATION_MODEL snapshot ${model.slice(configured.length + 1)}`;
  return "non-default-interpretation-model";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function overlayCase(originalText: string, referenceNow: number) {
  const interpretation = interpretCapture(originalText, referenceNow);
  return overlayLanguageModelCapture(interpretation, {
    apiKey: LIVE ? process.env.OPENAI_API_KEY : undefined,
    interpretationModel: process.env.OPENAI_INTERPRETATION_MODEL,
  });
}

async function overlayWithLiveRetry(originalText: string, referenceNow: number) {
  let overlayed = await overlayCase(originalText, referenceNow);
  if (!LIVE || !overlayed.languageProvenance?.fallback) return overlayed;
  for (const delay of RATE_LIMIT_BACKOFF_MS) {
    await sleep(delay);
    overlayed = await overlayCase(originalText, referenceNow);
    if (!overlayed.languageProvenance?.fallback) return overlayed;
  }
  return overlayed;
}

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

  it(
    "scores every case through overlayLanguageModelCapture used by POST /api/v1/captures",
    async () => {
      const scores = [];
      const latencies: number[] = [];
      const models = new Set<string>();
      let promptTokens = 0;
      let completionTokens = 0;
      let fallbackCount = 0;
      let overlayCalls = 0;
      let promptVersion = LIVE ? DIABETES_EVENT_PROMPT_VERSION : "deterministic-only";
      let schemaVersion = LIVE ? DIABETES_EVENT_SCHEMA_NAME : SEMANTIC_PARSER_VERSION;
      let parserVersion = SEMANTIC_PARSER_VERSION;

      for (const testCase of cases) {
        const referenceNow = Date.parse(testCase.reference_now ?? "2026-08-26T04:00:00.000Z");
        const started = Date.now();
        const overlayed = await overlayWithLiveRetry(testCase.raw_text, referenceNow);
        overlayCalls += 1;
        const wallMs = Date.now() - started;
        const provenance = overlayed.languageProvenance;
        if (provenance?.latencyMs != null) latencies.push(provenance.latencyMs);
        else latencies.push(wallMs);
        if (provenance?.model) models.add(provenance.model);
        if (typeof provenance?.promptTokens === "number") promptTokens += provenance.promptTokens;
        if (typeof provenance?.completionTokens === "number") completionTokens += provenance.completionTokens;
        if (provenance?.fallback) fallbackCount += 1;
        if (provenance?.promptVersion) promptVersion = provenance.promptVersion;
        if (provenance?.schemaVersion) schemaVersion = provenance.schemaVersion;
        if (provenance?.parserVersion) parserVersion = provenance.parserVersion;
        scores.push(scoreSemanticCase(testCase, overlayed));
      }

      const liveMeta: SemanticLiveRunMeta = {
        live: LIVE,
        requestedModel: LIVE
          ? auditModelLabel(process.env.OPENAI_INTERPRETATION_MODEL?.trim() || DEFAULT_INTERPRETATION_MODEL)
          : null,
        actualModels: [...models].map((model) => auditModelLabel(model) ?? model),
        promptVersion,
        schemaVersion,
        parserVersion,
        fallbackCount,
        overlayCalls,
        latencyMs: LIVE ? latencySummary(latencies) : null,
        tokens: LIVE ? { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens } : null,
        estimatedUsd: LIVE
          ? (promptTokens / 1_000_000) * USD_PER_MILLION_PROMPT + (completionTokens / 1_000_000) * USD_PER_MILLION_COMPLETION
          : null,
      };

      fs.mkdirSync(path.dirname(REPORT), { recursive: true });
      fs.writeFileSync(REPORT, renderSemanticReport(scores, liveMeta));
      const failed = scores.filter((row) => row.result !== "PASS");
      const safetyFailed = failed.filter((row) => cases.find((testCase) => testCase.case_id === row.caseId)?.severity === "SAFETY_CRITICAL");
      if (LIVE && fallbackCount > 0) {
        expect.fail(`live overlay fell back on ${fallbackCount} / ${overlayCalls} cases; real-model suite is not green`);
      }
      if (failed.length > 0) {
        const preview = failed
          .slice(0, 40)
          .map((row) => `${row.caseId} ${row.severity} ${row.failures.join("; ")}`)
          .join("\n");
        expect.fail(`${failed.length} failures (${safetyFailed.length} safety-critical)\n${preview}`);
      }
      expect(scores.filter((row) => row.result === "PASS")).toHaveLength(150);
    },
    LIVE ? LIVE_TIMEOUT_MS : 30_000,
  );
});
