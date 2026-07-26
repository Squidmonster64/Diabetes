import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestServer, devAuthHeader, baseSettingsPayload, baseBolusPayload, minutesAgoIso } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await makeTestServer());
});

afterAll(async () => {
  await app.close();
});

describe("refusal paths", () => {
  it("refuses when no settings exist for the patient", async () => {
    const patient = devAuthHeader("patient_no_settings");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "REFUSED", refusalCode: "NO_ACTIVE_CONFIGURATION" });
  });

  it("refuses low glucose", async () => {
    const patient = devAuthHeader("patient_low_glucose");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload({ currentGlucose: "3" }),
    });
    expect(response.json()).toMatchObject({ status: "REFUSED", refusalCode: "HYPO_THRESHOLD" });
  });

  it("refuses stale glucose", async () => {
    const patient = devAuthHeader("patient_stale_glucose");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload({ glucoseTimestamp: minutesAgoIso(30) }),
    });
    expect(response.json()).toMatchObject({ status: "REFUSED", refusalCode: "STALE_GLUCOSE" });
  });

  it("refuses an active-insulin scenario without subtraction", async () => {
    const patient = devAuthHeader("patient_active_insulin");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload({ activeInsulinUnits: "2" }),
    });
    expect(response.json()).toMatchObject({ status: "REFUSED", refusalCode: "ACTIVE_PRIOR_BOLUS" });
  });
});
