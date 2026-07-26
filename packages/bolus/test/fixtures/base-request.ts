import type { BolusCalculationRequest } from "../../src/types.js";

export function makeRequest(overrides: Partial<BolusCalculationRequest> = {}): BolusCalculationRequest {
  return {
    patientId: "patient_123",
    configurationId: "cfg_123",
    mode: "MEAL",
    currentGlucose: "10",
    glucoseUnit: "MMOL_L",
    glucoseTimestamp: "2026-07-24T03:58:00.000Z",
    glucoseSource: "CGM",
    glucoseConfirmed: true,
    glucoseTrend: null,
    carbohydrateGrams: "40",
    carbohydratesConfirmed: true,
    activeInsulinUnits: null,
    recentHistoryComplete: true,
    priorRapidActingDoses: [],
    hypoSymptoms: false,
    duplicateDose: false,
    specialSituations: [],
    concentratedInsulinConfirmed: true,
    calculatedAt: "2026-07-24T04:00:00.000Z",
    ...overrides,
  };
}
