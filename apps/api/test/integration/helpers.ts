import { buildServer } from "../../src/server.js";

export async function makeTestServer() {
  const { app, state } = await buildServer();
  await app.ready();
  return { app, state };
}

export function devAuthHeader(patientId: string): Record<string, string> {
  return { "x-dev-patient-id": patientId };
}

const nowIso = () => new Date().toISOString();
const minutesAgoIso = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function baseSettingsPayload(overrides: Record<string, unknown> = {}) {
  return {
    icr: "10",
    isf: "2",
    targetGlucose: "6",
    insulinDurationHours: "4",
    doseIncrementUnits: "0.5",
    maximumDoseUnits: "20",
    lowGlucoseThreshold: "4",
    glucoseUnit: "MMOL_L",
    insulinDurationEntrySource: "PATIENT_ENTERED_FROM_CLINICIAN_REPORT",
    insulinDurationSourceDate: "2026-06-01",
    insulinDurationSourceReference: "Clinic letter",
    insulinDurationPatientConfirmedAccurate: true,
    ...overrides,
  };
}

export function baseBolusPayload(overrides: Record<string, unknown> = {}) {
  return {
    mode: "MEAL",
    currentGlucose: "10",
    glucoseUnit: "MMOL_L",
    glucoseTimestamp: minutesAgoIso(2),
    glucoseSource: "CGM",
    glucoseConfirmed: true,
    carbohydrateGrams: "40",
    carbohydratesConfirmed: true,
    activeInsulinUnits: null,
    recentHistoryComplete: true,
    priorRapidActingDoses: [],
    hypoSymptoms: false,
    duplicateDose: false,
    specialSituations: [],
    concentratedInsulinConfirmed: true,
    calculatedAt: nowIso(),
    ...overrides,
  };
}

export { nowIso, minutesAgoIso };
