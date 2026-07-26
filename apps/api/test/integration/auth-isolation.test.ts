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

describe("authenticated access and user isolation", () => {
  it("rejects unauthenticated requests to protected routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/history" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("one user cannot access another user's history event", async () => {
    const patientA = devAuthHeader("patient_a");
    const patientB = devAuthHeader("patient_b");

    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patientA, payload: baseSettingsPayload() });
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patientA,
      payload: baseBolusPayload(),
    });
    const preview = previewResponse.json();
    await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patientA,
      payload: { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash },
    });

    const crossAccessResponse = await app.inject({
      method: "GET",
      url: `/api/v1/history/${preview.calculationId}`,
      headers: patientB,
    });
    expect(crossAccessResponse.statusCode).toBe(404);

    const crossConfirmResponse = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patientB,
      payload: { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash },
    });
    expect(crossConfirmResponse.statusCode).toBe(409);
    expect(crossConfirmResponse.json().error.code).toBe("PATIENT_MISMATCH");

    const bHistoryResponse = await app.inject({ method: "GET", url: "/api/v1/history", headers: patientB });
    expect(bHistoryResponse.json().events).toHaveLength(0);
  });

  it("one user's settings are not visible to another user", async () => {
    const patientA = devAuthHeader("patient_settings_a");
    const patientB = devAuthHeader("patient_settings_b");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patientA, payload: baseSettingsPayload() });

    const bSettingsResponse = await app.inject({ method: "GET", url: "/api/v1/settings/current", headers: patientB });
    expect(bSettingsResponse.statusCode).toBe(404);
  });
});
