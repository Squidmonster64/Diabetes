import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeTestServer, devAuthHeader } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await makeTestServer());
});

afterAll(async () => {
  await app.close();
});

async function createPacketLabelFood(patient: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/custom-foods",
    headers: patient,
    payload: {
      foodType: "PACKET_LABEL",
      name: "Brand X Muesli Bar",
      brand: "Brand X",
      servingDescription: "1 bar (35 g)",
      servingGrams: 35,
      carbohydratePerServingGrams: 21,
      ...overrides,
    },
  });
  return response;
}

async function createManualFood(patient: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/custom-foods",
    headers: patient,
    payload: { foodType: "MANUAL", name: "Homemade soup", carbohydratePer100gGrams: 4, ...overrides },
  });
  return response;
}

describe("custom foods", () => {
  it("creates a packet-label food and derives the per-100g figure", async () => {
    const patient = devAuthHeader("cf_patient_packet");
    const response = await createPacketLabelFood(patient);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    // 21 g carbohydrate per 35 g serving => 60 g per 100 g
    expect(body.carbohydratePer100gGrams).toBe("60");
    expect(body.archivedAt).toBeNull();
  });

  it("creates a manual food with a direct per-100g figure", async () => {
    const patient = devAuthHeader("cf_patient_manual");
    const response = await createManualFood(patient);
    expect(response.statusCode).toBe(201);
    expect(response.json().carbohydratePer100gGrams).toBe("4");
  });

  it("rejects an invalid custom food (no carbohydrate data at all)", async () => {
    const patient = devAuthHeader("cf_patient_invalid");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/custom-foods",
      headers: patient,
      payload: { foodType: "MANUAL", name: "Mystery food" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_CUSTOM_FOOD");
  });

  it("calculate-carbohydrate scales a custom food's per-100g figure by the requested grams", async () => {
    const patient = devAuthHeader("cf_patient_calc");
    const created = await createManualFood(patient, { name: "Rice", carbohydratePer100gGrams: 28 });
    const foodId = created.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/custom-foods/${foodId}/calculate-carbohydrate`,
      headers: patient,
      payload: { grams: 150 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().carbohydrateGrams).toBe(42);
  });

  it("calculate-carbohydrate refuses another patient's custom food", async () => {
    const owner = devAuthHeader("cf_patient_calc_owner");
    const intruder = devAuthHeader("cf_patient_calc_intruder");
    const created = await createManualFood(owner, { name: "Owner's soup" });
    const foodId = created.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/custom-foods/${foodId}/calculate-carbohydrate`,
      headers: intruder,
      payload: { grams: 100 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("archiving hides a food from the default list but keeps it retrievable", async () => {
    const patient = devAuthHeader("cf_patient_archive");
    const created = await createManualFood(patient, { name: "Old snack" });
    const foodId = created.json().id;

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/api/v1/custom-foods/${foodId}/archive`,
      headers: patient,
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json().archivedAt).not.toBeNull();

    const defaultList = await app.inject({ method: "GET", url: "/api/v1/custom-foods", headers: patient });
    expect(defaultList.json().foods.some((f: { id: string }) => f.id === foodId)).toBe(false);

    const fullList = await app.inject({
      method: "GET",
      url: "/api/v1/custom-foods?includeArchived=true",
      headers: patient,
    });
    expect(fullList.json().foods.some((f: { id: string }) => f.id === foodId)).toBe(true);

    const unarchiveResponse = await app.inject({
      method: "POST",
      url: `/api/v1/custom-foods/${foodId}/unarchive`,
      headers: patient,
    });
    expect(unarchiveResponse.json().archivedAt).toBeNull();

    const restoredList = await app.inject({ method: "GET", url: "/api/v1/custom-foods", headers: patient });
    expect(restoredList.json().foods.some((f: { id: string }) => f.id === foodId)).toBe(true);
  });

  it("one patient cannot access another patient's custom food", async () => {
    const patientA = devAuthHeader("cf_patient_isolation_a");
    const patientB = devAuthHeader("cf_patient_isolation_b");
    const created = await createManualFood(patientA);
    const foodId = created.json().id;

    const response = await app.inject({ method: "GET", url: `/api/v1/custom-foods/${foodId}`, headers: patientB });
    expect(response.statusCode).toBe(404);
  });
});

describe("saved meals", () => {
  it("creates a meal mixing an official AUSNUT food and a custom food, and computes the total", async () => {
    const patient = devAuthHeader("meal_patient_mixed");
    const customFood = await createManualFood(patient, { name: "Protein shake", carbohydratePer100gGrams: 5 });
    const customFoodId = customFood.json().id;

    const searchResponse = await app.inject({ method: "GET", url: "/api/v1/foods/search?q=Weet-Bix" });
    const weetbix = searchResponse.json().results[0];

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: {
        name: "Usual breakfast",
        components: [
          {
            componentSource: weetbix.sourceDataset === "AUSNUT_2023" ? "AUSNUT" : "AFCD",
            sourceDataset: weetbix.sourceDataset,
            sourceFoodId: weetbix.sourceFoodId,
            label: weetbix.foodName,
            quantityKind: "GRAMS",
            quantityGrams: 30,
          },
          {
            componentSource: "CUSTOM",
            customFoodId,
            label: "Protein shake",
            quantityKind: "GRAMS",
            quantityGrams: 300,
          },
        ],
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const meal = createResponse.json();
    expect(meal.components).toHaveLength(2);

    const getResponse = await app.inject({ method: "GET", url: `/api/v1/meals/${meal.id}`, headers: patient });
    expect(getResponse.statusCode).toBe(200);
    const { calculation } = getResponse.json();
    // Weet-Bix 30g => 17g carbs (per existing food test fixture data), shake 300g @ 5g/100g => 15g
    expect(calculation.totalCarbohydrateGrams).toBeCloseTo(32, 1);
    expect(calculation.components).toHaveLength(2);
  });

  it("editing a component's quantity changes the computed total", async () => {
    const patient = devAuthHeader("meal_patient_edit");
    const customFood = await createManualFood(patient, { name: "Rice", carbohydratePer100gGrams: 28 });
    const customFoodId = customFood.json().id;

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: {
        name: "Rice bowl",
        components: [
          { componentSource: "CUSTOM", customFoodId, label: "Rice", quantityKind: "GRAMS", quantityGrams: 100 },
        ],
      },
    });
    const meal = createResponse.json();
    const componentId = meal.components[0].id;

    const before = await app.inject({ method: "GET", url: `/api/v1/meals/${meal.id}`, headers: patient });
    expect(before.json().calculation.totalCarbohydrateGrams).toBeCloseTo(28, 1);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/meals/${meal.id}/components/${componentId}`,
      headers: patient,
      payload: { quantityKind: "GRAMS", quantityGrams: 200 },
    });
    expect(patchResponse.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: `/api/v1/meals/${meal.id}`, headers: patient });
    expect(after.json().calculation.totalCarbohydrateGrams).toBeCloseTo(56, 1);
  });

  it("adds and removes a component", async () => {
    const patient = devAuthHeader("meal_patient_addremove");
    const customFood = await createManualFood(patient, { name: "Butter", carbohydratePer100gGrams: 0 });
    const customFoodId = customFood.json().id;

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: { name: "Toast", components: [] },
    });
    const mealId = createResponse.json().id;

    const addResponse = await app.inject({
      method: "POST",
      url: `/api/v1/meals/${mealId}/components`,
      headers: patient,
      payload: { componentSource: "CUSTOM", customFoodId, label: "Butter", quantityKind: "GRAMS", quantityGrams: 10 },
    });
    expect(addResponse.statusCode).toBe(200);
    expect(addResponse.json().components).toHaveLength(1);
    const componentId = addResponse.json().components[0].id;

    const removeResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/meals/${mealId}/components/${componentId}`,
      headers: patient,
    });
    expect(removeResponse.statusCode).toBe(200);
    expect(removeResponse.json().components).toHaveLength(0);
  });

  it("duplicates a meal with its components copied", async () => {
    const patient = devAuthHeader("meal_patient_duplicate");
    const customFood = await createManualFood(patient, { name: "Honey", carbohydratePer100gGrams: 82 });
    const customFoodId = customFood.json().id;

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: {
        name: "Tea with honey",
        components: [
          { componentSource: "CUSTOM", customFoodId, label: "Honey", quantityKind: "GRAMS", quantityGrams: 10 },
        ],
      },
    });
    const original = createResponse.json();

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/v1/meals/${original.id}/duplicate`,
      headers: patient,
      payload: { name: "Tea with extra honey" },
    });
    expect(duplicateResponse.statusCode).toBe(201);
    const duplicate = duplicateResponse.json();
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.duplicatedFromMealId).toBe(original.id);
    expect(duplicate.components).toHaveLength(1);
    expect(duplicate.components[0].label).toBe("Honey");

    // Editing the duplicate must not affect the original.
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/meals/${duplicate.id}/components/${duplicate.components[0].id}`,
      headers: patient,
      payload: { quantityKind: "GRAMS", quantityGrams: 50 },
    });
    expect(patchResponse.statusCode).toBe(200);

    const originalAfter = await app.inject({ method: "GET", url: `/api/v1/meals/${original.id}`, headers: patient });
    expect(originalAfter.json().calculation.totalCarbohydrateGrams).toBeCloseTo(8.2, 1);
  });

  it("archiving and unarchiving a meal changes default list visibility", async () => {
    const patient = devAuthHeader("meal_patient_archive");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: { name: "Seldom used meal", components: [] },
    });
    const mealId = createResponse.json().id;

    await app.inject({ method: "POST", url: `/api/v1/meals/${mealId}/archive`, headers: patient });
    const defaultList = await app.inject({ method: "GET", url: "/api/v1/meals", headers: patient });
    expect(defaultList.json().meals.some((m: { id: string }) => m.id === mealId)).toBe(false);

    const fullList = await app.inject({ method: "GET", url: "/api/v1/meals?includeArchived=true", headers: patient });
    expect(fullList.json().meals.some((m: { id: string }) => m.id === mealId)).toBe(true);
  });

  it("calculate-carbohydrate accepts a per-instance override without persisting it", async () => {
    const patient = devAuthHeader("meal_patient_override");
    const customFood = await createManualFood(patient, { name: "Milk", carbohydratePer100gGrams: 5 });
    const customFoodId = customFood.json().id;

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: {
        name: "Cereal with milk",
        components: [
          { componentSource: "CUSTOM", customFoodId, label: "Milk", quantityKind: "GRAMS", quantityGrams: 200 },
        ],
      },
    });
    const meal = createResponse.json();
    const componentId = meal.components[0].id;

    const overrideResponse = await app.inject({
      method: "POST",
      url: `/api/v1/meals/${meal.id}/calculate-carbohydrate`,
      headers: patient,
      payload: { overrides: [{ componentId, quantityKind: "GRAMS", quantityGrams: "400" }] },
    });
    expect(overrideResponse.json().totalCarbohydrateGrams).toBeCloseTo(20, 1);

    // The saved recipe itself must be unchanged.
    const afterResponse = await app.inject({ method: "GET", url: `/api/v1/meals/${meal.id}`, headers: patient });
    expect(afterResponse.json().calculation.totalCarbohydrateGrams).toBeCloseTo(10, 1);
    expect(afterResponse.json().meal.components[0].quantityGrams).toBe("200");
  });

  it("rejects a meal component referencing another patient's custom food", async () => {
    const patientA = devAuthHeader("meal_patient_cross_a");
    const patientB = devAuthHeader("meal_patient_cross_b");
    const foodA = await createManualFood(patientA, { name: "Patient A's food" });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patientB,
      payload: {
        name: "Cross-patient meal",
        components: [
          {
            componentSource: "CUSTOM",
            customFoodId: foodA.json().id,
            label: "Borrowed food",
            quantityKind: "GRAMS",
            quantityGrams: 50,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("one patient cannot access another patient's meal", async () => {
    const patientA = devAuthHeader("meal_patient_isolation_a");
    const patientB = devAuthHeader("meal_patient_isolation_b");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patientA,
      payload: { name: "Private meal", components: [] },
    });
    const mealId = createResponse.json().id;

    const response = await app.inject({ method: "GET", url: `/api/v1/meals/${mealId}`, headers: patientB });
    expect(response.statusCode).toBe(404);

    const listResponse = await app.inject({ method: "GET", url: "/api/v1/meals", headers: patientB });
    expect(listResponse.json().meals.some((m: { id: string }) => m.id === mealId)).toBe(false);
  });

  it("feeds a meal's confirmed carbohydrate total into the unmodified bolus module", async () => {
    const patient = devAuthHeader("meal_patient_bolus_boundary");
    const customFood = await createManualFood(patient, { name: "Pasta", carbohydratePer100gGrams: 25 });
    const createMeal = await app.inject({
      method: "POST",
      url: "/api/v1/meals",
      headers: patient,
      payload: {
        name: "Pasta dinner",
        components: [
          {
            componentSource: "CUSTOM",
            customFoodId: customFood.json().id,
            label: "Pasta",
            quantityKind: "GRAMS",
            quantityGrams: 160,
          },
        ],
      },
    });
    const meal = createMeal.json();
    const mealDetail = await app.inject({ method: "GET", url: `/api/v1/meals/${meal.id}`, headers: patient });
    const totalCarbs = mealDetail.json().calculation.totalCarbohydrateGrams;
    expect(totalCarbs).toBeCloseTo(40, 1);

    await app.inject({
      method: "POST",
      url: "/api/v1/settings",
      headers: patient,
      payload: {
        icr: "10",
        isf: "2",
        targetGlucose: "6",
        insulinDurationHours: "4",
        doseIncrementUnits: "0.5",
        maximumDoseUnits: "20",
        lowGlucoseThreshold: "4",
        glucoseUnit: "MMOL_L",
        insulinDurationEntrySource: "PATIENT_ENTERED_FROM_CLINICIAN_REPORT",
        insulinDurationPatientConfirmedAccurate: true,
      },
    });

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bolus/preview",
      headers: patient,
      payload: {
        mode: "MEAL",
        currentGlucose: "6",
        glucoseUnit: "MMOL_L",
        glucoseTimestamp: new Date().toISOString(),
        glucoseSource: "CGM",
        glucoseConfirmed: true,
        carbohydrateGrams: String(totalCarbs),
        carbohydratesConfirmed: true,
        activeInsulinUnits: null,
        recentHistoryComplete: true,
        priorRapidActingDoses: [],
        hypoSymptoms: false,
        duplicateDose: false,
        specialSituations: [],
        concentratedInsulinConfirmed: true,
        calculatedAt: new Date().toISOString(),
      },
    });
    expect(previewResponse.statusCode).toBe(200);
    const preview = previewResponse.json();
    expect(preview.status).toBe("CALCULATED");
    // 40g / 10 g/U = 4 U meal component, glucose at target so correction = 0
    expect(preview.roundedTotalUnits).toBe("4");
  });
});
