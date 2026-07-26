import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { InMemoryAuditStore } from "@diabetes-companion/bolus";
import { makeTestServer, devAuthHeader, baseSettingsPayload, baseBolusPayload } from "./helpers.js";

let app: FastifyInstance;
let auditStore: InMemoryAuditStore;

beforeAll(async () => {
  const server = await makeTestServer();
  app = server.app;
  auditStore = server.state.auditStore as InMemoryAuditStore;
});

afterAll(async () => {
  await app.close();
});

describe("logging-failure handling", () => {
  it("displays no dose when audit persistence fails before the result would be shown", async () => {
    const patient = devAuthHeader("patient_logging_failure");
    await app.inject({ method: "POST", url: "/api/v1/settings", headers: patient, payload: baseSettingsPayload() });

    auditStore.failNextAppend();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: baseBolusPayload(),
    });
    const body = response.json();
    expect(body).toMatchObject({ status: "REFUSED", refusalCode: "AUDIT_PERSISTENCE_FAILURE" });
    expect(body.roundedTotalUnits).toBeUndefined();
  });
});
