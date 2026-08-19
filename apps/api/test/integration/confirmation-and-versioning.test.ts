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

describe("confirmation, rejection and settings versioning", () => {
  it("duplicate confirmation does not duplicate history", async () => {
    const patient = devAuthHeader("patient_dup_confirm");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload(),
    });
    const preview = previewResponse.json();

    const confirmPayload = { confirmationRequestId: "confirm-attempt-1", confirmedAt: "2099-01-01T00:00:00.000Z", expectedSnapshotHash: preview.snapshotHash };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patient,
      payload: confirmPayload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("USER_CONFIRMED");

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patient,
      payload: confirmPayload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("DUPLICATE_CONFIRMATION");
    expect(second.json().record.calculationId).toBe(preview.calculationId);

    const historyResponse = await app.inject({ method: "GET", url: "/api/v1/history", headers: patient });
    expect(historyResponse.json().events).toHaveLength(1);
  });

  it("rejecting a preview prevents later confirmation", async () => {
    const patient = devAuthHeader("patient_reject");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    const staleClientTimestamp = "2000-01-01T00:00:00.000Z";
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload({ calculatedAt: staleClientTimestamp }),
    });
    const preview = previewResponse.json();
    expect(preview.serverNow).toBeTruthy();
    expect(preview.serverNow).not.toBe(staleClientTimestamp);

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/reject`,
      headers: patient,
      payload: { rejectedAt: "2099-01-01T00:00:00.000Z", reason: "USER_REJECTED" },
    });
    expect(rejectResponse.statusCode).toBe(200);

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/v1/bolus/previews/${preview.calculationId}/confirm`,
      headers: patient,
      payload: { confirmationRequestId: "confirm-after-rejection", confirmedAt: "2000-01-01T00:00:00.000Z", expectedSnapshotHash: preview.snapshotHash },
    });
    expect(confirmResponse.statusCode).toBe(409);
    expect(confirmResponse.json().error.code).toBe("CALCULATION_INVALIDATED");
  });

  it("a settings update creates a new version and keeps the prior version in history", async () => {
    const patient = devAuthHeader("patient_settings_version");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    await app.inject({
      method: "POST",
      url: "/api/v1/settings",
      headers: patient,
      payload: baseSettingsPayload({ icr: "12" }),
    });

    const historyResponse = await app.inject({ method: "GET", url: "/api/v1/settings/history", headers: patient });
    const history = historyResponse.json().history;
    expect(history).toHaveLength(2);
    const active = history.find((v: { status: string }) => v.status === "ACTIVE");
    const superseded = history.find((v: { status: string }) => v.status === "SUPERSEDED");
    expect(active.version).toBe(2);
    expect(active.icr).toBe("12");
    expect(superseded.version).toBe(1);

    const currentResponse = await app.inject({ method: "GET", url: "/api/v1/settings/current", headers: patient });
    expect(currentResponse.json().version).toBe(2);
  });
});
