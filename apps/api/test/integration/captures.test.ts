import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestServer, devAuthHeader, baseSettingsPayload, baseBolusPayload } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await makeTestServer());
});

afterAll(async () => {
  await app.close();
});

describe("capture provenance pipeline", () => {
  const patient = devAuthHeader("patient_capture_beta");

  it("preserves original text, classifies intent, and never invents a dose", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: {
        originalText: "My blood glucose is 8.4 mmol/L and I am eating 40 grams of rice.",
        sourceType: "typed",
        clientCaptureId: "client-capture-meal-1",
        referenceNowMs: Date.parse("2026-07-25T20:00:00.000Z"),
      },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json();
    expect(capture.captureCode).toBe("D001");
    expect(capture.originalText).toBe("My blood glucose is 8.4 mmol/L and I am eating 40 grams of rice.");
    expect(capture.intent).toBe("MEAL_BOLUS_CANDIDATE");
    expect(capture.interpretation.extraction.glucose.value.value).toBe(8.4);
    expect(capture.interpretation.roundedTotalUnits).toBeUndefined();
    expect(capture.interpretation.extraction.bolusDose).toBeUndefined();

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: {
        originalText: "different words that must not replace the original",
        sourceType: "typed",
        clientCaptureId: "client-capture-meal-1",
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().originalText).toBe(capture.originalText);
    expect(replay.json().id).toBe(capture.id);
  });

  it("refuses to apply settings language and keeps the original words", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: { originalText: "Please change my ICR to 8.", sourceType: "typed" },
    });
    expect(created.statusCode).toBe(201);
    const capture = created.json();
    expect(capture.intent).toBe("SETTINGS_CHANGE_ATTEMPT");
    expect(capture.interpretation.proposedNextStep.kind).toBe("SETTINGS_SCREEN_ONLY");

    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: { ...baseBolusPayload(), captureId: capture.id },
    });
    expect(preview.statusCode).toBe(409);
    expect(preview.json().error.code).toBe("INTERPRETATION_NOT_ACCEPTED");
  });

  it("blocks calculation until the interpretation is accepted, then links provenance", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/settings",
      headers: patient,
      payload: baseSettingsPayload(),
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: {
        originalText: "My blood glucose is 10 mmol/L and I am eating 40 grams of rice.",
        sourceType: "voice",
        clientCaptureId: "client-capture-link-1",
      },
    });
    const capture = created.json();

    const tooEarly = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: { ...baseBolusPayload(), captureId: capture.id },
    });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json().error.code).toBe("INTERPRETATION_NOT_ACCEPTED");

    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/captures/${capture.id}/accept`,
      headers: patient,
      payload: { extraction: capture.interpretation.extraction },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().interpretationStatus).toBe("ACCEPTED");
    expect(accepted.json().originalText).toBe(capture.originalText);

    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: { ...baseBolusPayload(), captureId: capture.id },
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.status).toBe("CALCULATED");
    expect(previewBody.captureId).toBe(capture.id);
    expect(previewBody.roundedTotalUnits).toBeTruthy();

    const details = await app.inject({
      method: "GET",
      url: `/api/v1/history/${previewBody.calculationId}`,
      headers: patient,
    });
    expect(details.statusCode).toBe(200);
    expect(details.json().capture.captureCode).toBe(capture.captureCode);
    expect(details.json().capture.originalText).toBe(capture.originalText);
  });

  it("does not let another patient read a capture", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: { originalText: "My blood glucose is 7 mmol/L.", sourceType: "typed" },
    });
    const other = await app.inject({
      method: "GET",
      url: `/api/v1/captures/${created.json().id}`,
      headers: devAuthHeader("someone_else"),
    });
    expect(other.statusCode).toBe(404);
  });

  it("rejects an excluded-context capture instead of calculating", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: patient,
      payload: { originalText: "I am unconscious", sourceType: "typed" },
    });
    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/captures/${created.json().id}/accept`,
      headers: patient,
      payload: {},
    });
    expect(accepted.statusCode).toBe(409);
    expect(accepted.json().error.code).toBe("EXCLUDED_CLINICAL_CONTEXT");
  });
});
