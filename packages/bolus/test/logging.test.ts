import { describe, expect, it } from "vitest";
import { redact, createOperationalLogEntry } from "../src/logging.js";
import { InMemoryAuditStore } from "../src/repositories.js";

describe("redact", () => {
  it("redacts known-sensitive keys recursively", () => {
    const redacted = redact({
      token: "secret-value",
      nested: { password: "hunter2", ok: "fine" },
      currentGlucose: "6",
    }) as Record<string, unknown>;
    expect(redacted.token).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).ok).toBe("fine");
    expect(redacted.currentGlucose).toBe("[REDACTED]");
  });

  it("creates an operational log entry with redacted context", () => {
    const entry = createOperationalLogEntry("info", "food search", "req_1", { authorization: "Bearer xyz" });
    expect(entry.context.authorization).toBe("[REDACTED]");
    expect(entry.requestId).toBe("req_1");
  });
});

describe("InMemoryAuditStore hash-chain integrity", () => {
  it("verifies an untampered chain", async () => {
    const store = new InMemoryAuditStore();
    await store.append({
      eventType: "CALCULATION_STARTED",
      patientId: "patient_123",
      calculationId: "calc_1",
      occurredAt: "2026-07-24T04:00:00.000Z",
      payload: {},
      offline: false,
    });
    await store.append({
      eventType: "CALCULATION_COMPLETED",
      patientId: "patient_123",
      calculationId: "calc_1",
      occurredAt: "2026-07-24T04:00:01.000Z",
      payload: {},
      offline: false,
    });
    expect(await store.verifyChain()).toBe(true);
  });

  it("detects a tampered event", async () => {
    const store = new InMemoryAuditStore();
    await store.append({
      eventType: "CALCULATION_STARTED",
      patientId: "patient_123",
      calculationId: "calc_1",
      occurredAt: "2026-07-24T04:00:00.000Z",
      payload: { foo: "bar" },
      offline: false,
    });
    store.tamperForTest(0, { payload: { foo: "tampered" } });
    expect(await store.verifyChain()).toBe(false);
  });

  it("detects a reordered/deleted event via broken hash-chain linkage", async () => {
    const store = new InMemoryAuditStore();
    await store.append({
      eventType: "CALCULATION_STARTED",
      patientId: "patient_123",
      calculationId: "calc_1",
      occurredAt: "2026-07-24T04:00:00.000Z",
      payload: {},
      offline: false,
    });
    await store.append({
      eventType: "CALCULATION_COMPLETED",
      patientId: "patient_123",
      calculationId: "calc_1",
      occurredAt: "2026-07-24T04:00:01.000Z",
      payload: {},
      offline: false,
    });
    store.tamperForTest(1, { previousHash: "0000000000000000000000000000000000000000000000000000000000000000" });
    expect(await store.verifyChain()).toBe(false);
  });
});
