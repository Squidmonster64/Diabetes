import type { FastifyInstance } from "fastify";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";
import type { NewSettingsInput } from "../repositories/memory.js";

const REQUIRED_FIELDS: readonly (keyof NewSettingsInput)[] = [
  "icr",
  "isf",
  "targetGlucose",
  "insulinDurationHours",
  "doseIncrementUnits",
  "maximumDoseUnits",
  "lowGlucoseThreshold",
  "glucoseUnit",
  "insulinDurationEntrySource",
  "insulinDurationPatientConfirmedAccurate",
];

export function registerSettingsRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/v1/settings/current", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const settings = await state.settingsRepository.getActiveSettings(patientId);
    if (!settings) throw new HttpError(404, "NO_ACTIVE_CONFIGURATION", "No active clinician-supplied settings exist.");
    return settings;
  });

  app.get("/api/v1/settings/history", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    return { history: await state.settingsRepository.getHistory(patientId) };
  });

  app.post("/api/v1/settings", { preHandler: app.requireAuth }, async (request, reply) => {
    const patientId = request.patientId!;
    const body = request.body as Partial<NewSettingsInput>;

    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === null) {
        throw new HttpError(400, "INVALID_CONFIGURATION", `Missing required field: ${field}`);
      }
    }
    if (body.insulinDurationPatientConfirmedAccurate !== true) {
      throw new HttpError(
        400,
        "INVALID_CONFIGURATION",
        "The patient must explicitly confirm the entered values match their current clinician-approved plan.",
      );
    }
    if (
      body.insulinDurationEntrySource !== "PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION" &&
      body.insulinDurationEntrySource !== "PATIENT_ENTERED_FROM_CLINICIAN_REPORT"
    ) {
      throw new HttpError(400, "INVALID_CONFIGURATION", "Unrecognised insulin duration entry source.");
    }

    const now = new Date().toISOString();
    const record = await state.settingsRepository.createVersion(
      {
        patientId,
        icr: String(body.icr),
        isf: String(body.isf),
        targetGlucose: String(body.targetGlucose),
        insulinDurationHours: String(body.insulinDurationHours),
        doseIncrementUnits: String(body.doseIncrementUnits),
        maximumDoseUnits: String(body.maximumDoseUnits),
        lowGlucoseThreshold: String(body.lowGlucoseThreshold),
        glucoseUnit: body.glucoseUnit as "MMOL_L" | "MG_DL",
        insulinDurationEntrySource: body.insulinDurationEntrySource,
        insulinDurationSourceDate: body.insulinDurationSourceDate,
        insulinDurationSourceReference: body.insulinDurationSourceReference,
        insulinDurationPatientConfirmedAccurate: true,
      },
      now,
    );
    reply.code(201);
    return record;
  });
}
