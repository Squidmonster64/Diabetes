import { test, expect } from "@playwright/test";
import { createSettings, previewBolus, devAuthHeader, minutesAgoIso } from "./helpers.js";

test("1. Weet-Bix end-to-end success path", async ({ request }) => {
  const patientId = "e2e_weetbix";

  const searchResponse = await request.get("/api/v1/foods/search?q=Weet-Bix");
  expect(searchResponse.ok()).toBeTruthy();
  const search = await searchResponse.json();
  expect(search.results.length).toBeGreaterThan(0);
  const food = search.results[0];

  const carbResponse = await request.post("/api/v1/foods/calculate-carbohydrate", {
    data: { kind: "GRAMS", sourceDataset: food.sourceDataset, sourceFoodId: food.sourceFoodId, grams: 30 },
  });
  expect(carbResponse.ok()).toBeTruthy();
  const carb = await carbResponse.json();

  const settingsResponse = await createSettings(request, patientId);
  expect(settingsResponse.status()).toBe(201);

  const previewResponse = await previewBolus(request, patientId, {
    carbohydrateGrams: String(carb.carbohydrateGrams),
  });
  expect(previewResponse.ok()).toBeTruthy();
  const preview = await previewResponse.json();
  expect(preview.status).toBe("CALCULATED");

  const confirmResponse = await request.post(`/api/v1/bolus/previews/${preview.calculationId}/confirm`, {
    headers: devAuthHeader(patientId),
    data: { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash },
  });
  expect(confirmResponse.ok()).toBeTruthy();
  expect((await confirmResponse.json()).state).toBe("USER_CONFIRMED");

  const historyResponse = await request.get("/api/v1/history", { headers: devAuthHeader(patientId) });
  const history = await historyResponse.json();
  expect(history.events).toHaveLength(1);
});

test("2. Low-glucose refusal", async ({ request }) => {
  const patientId = "e2e_low_glucose";
  await createSettings(request, patientId);
  const response = await previewBolus(request, patientId, { currentGlucose: "3" });
  const body = await response.json();
  expect(body).toMatchObject({ status: "REFUSED", refusalCode: "HYPO_THRESHOLD" });
});

test("3. Stale-glucose refusal", async ({ request }) => {
  const patientId = "e2e_stale_glucose";
  await createSettings(request, patientId);
  const response = await previewBolus(request, patientId, { glucoseTimestamp: minutesAgoIso(30) });
  const body = await response.json();
  expect(body).toMatchObject({ status: "REFUSED", refusalCode: "STALE_GLUCOSE" });
});

test("4. Missing-settings refusal", async ({ request }) => {
  const patientId = "e2e_missing_settings";
  const response = await previewBolus(request, patientId);
  const body = await response.json();
  expect(body).toMatchObject({ status: "REFUSED", refusalCode: "NO_ACTIVE_CONFIGURATION" });
});

test("5. Active-insulin scenario refuses without subtraction", async ({ request }) => {
  const patientId = "e2e_active_insulin";
  await createSettings(request, patientId);
  const response = await previewBolus(request, patientId, { activeInsulinUnits: "3" });
  const body = await response.json();
  expect(body).toMatchObject({ status: "REFUSED", refusalCode: "ACTIVE_PRIOR_BOLUS" });
  expect(body.roundedTotalUnits).toBeUndefined();
});

test("6. Settings update creates a new version", async ({ request }) => {
  const patientId = "e2e_settings_version";
  await createSettings(request, patientId);
  await createSettings(request, patientId, { icr: "8" });

  const historyResponse = await request.get("/api/v1/settings/history", { headers: devAuthHeader(patientId) });
  const history = (await historyResponse.json()).history;
  expect(history).toHaveLength(2);

  const currentResponse = await request.get("/api/v1/settings/current", { headers: devAuthHeader(patientId) });
  const current = await currentResponse.json();
  expect(current.version).toBe(2);
  expect(current.icr).toBe("8");
});

test("7. Duplicate confirmation does not duplicate history", async ({ request }) => {
  const patientId = "e2e_duplicate_confirm";
  await createSettings(request, patientId);
  const previewResponse = await previewBolus(request, patientId);
  const preview = await previewResponse.json();

  const confirmPayload = { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash };
  const first = await request.post(`/api/v1/bolus/previews/${preview.calculationId}/confirm`, {
    headers: devAuthHeader(patientId),
    data: confirmPayload,
  });
  expect(first.ok()).toBeTruthy();

  const second = await request.post(`/api/v1/bolus/previews/${preview.calculationId}/confirm`, {
    headers: devAuthHeader(patientId),
    data: confirmPayload,
  });
  expect(second.status()).toBe(409);

  const historyResponse = await request.get("/api/v1/history", { headers: devAuthHeader(patientId) });
  expect((await historyResponse.json()).events).toHaveLength(1);
});

test("8. One user cannot access another user's records", async ({ request }) => {
  const patientA = "e2e_isolation_a";
  const patientB = "e2e_isolation_b";
  await createSettings(request, patientA);
  const previewResponse = await previewBolus(request, patientA);
  const preview = await previewResponse.json();
  await request.post(`/api/v1/bolus/previews/${preview.calculationId}/confirm`, {
    headers: devAuthHeader(patientA),
    data: { confirmedAt: new Date().toISOString(), expectedSnapshotHash: preview.snapshotHash },
  });

  const crossAccess = await request.get(`/api/v1/history/${preview.calculationId}`, {
    headers: devAuthHeader(patientB),
  });
  expect(crossAccess.status()).toBe(404);

  const bSettings = await request.get("/api/v1/settings/current", { headers: devAuthHeader(patientB) });
  expect(bSettings.status()).toBe(404);

  const bHistory = await request.get("/api/v1/history", { headers: devAuthHeader(patientB) });
  expect((await bHistory.json()).events).toHaveLength(0);
});
