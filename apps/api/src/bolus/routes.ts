import type { FastifyInstance } from "fastify";
import {
  calculateBolusPreview,
  confirmBolus,
  rejectBolusPreview,
  logConfirmedBolus,
  uuidGenerator,
  systemClock,
  type BolusCalculationRequest,
  type SafetyContext,
} from "@diabetes-companion/bolus";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";

export function registerBolusRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/bolus/preview", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;

    const bolusRequest: BolusCalculationRequest = {
      patientId,
      configurationId: String(body.configurationId ?? ""),
      mode: body.mode as BolusCalculationRequest["mode"],
      currentGlucose: String(body.currentGlucose ?? ""),
      glucoseUnit: body.glucoseUnit as BolusCalculationRequest["glucoseUnit"],
      glucoseTimestamp: String(body.glucoseTimestamp ?? ""),
      glucoseSource: body.glucoseSource as BolusCalculationRequest["glucoseSource"],
      glucoseConfirmed: body.glucoseConfirmed === true,
      glucoseTrend: (body.glucoseTrend as BolusCalculationRequest["glucoseTrend"]) ?? null,
      carbohydrateGrams: String(body.carbohydrateGrams ?? ""),
      carbohydratesConfirmed: body.carbohydratesConfirmed === true,
      activeInsulinUnits: body.activeInsulinUnits === null || body.activeInsulinUnits === undefined
        ? null
        : String(body.activeInsulinUnits),
      recentHistoryComplete: body.recentHistoryComplete === true,
      priorRapidActingDoses: Array.isArray(body.priorRapidActingDoses)
        ? (body.priorRapidActingDoses as { units: string; administeredAt: string }[])
        : [],
      hypoSymptoms: body.hypoSymptoms === true,
      duplicateDose: body.duplicateDose === true,
      specialSituations: Array.isArray(body.specialSituations)
        ? (body.specialSituations as BolusCalculationRequest["specialSituations"])
        : [],
      concentratedInsulinConfirmed: body.concentratedInsulinConfirmed === true,
      calculatedAt: String(body.calculatedAt ?? new Date().toISOString()),
    };

    const context: SafetyContext = {
      authenticatedPatientId: patientId,
      patientIsAdult: request.headers["x-patient-is-adult"] !== "false",
      serverNow: systemClock.now(),
    };

    const result = await calculateBolusPreview(bolusRequest, context, {
      settingsRepository: state.settingsRepository,
      auditStore: state.auditStore,
      calculationRepository: state.calculationRepository,
      clock: systemClock,
      idGenerator: uuidGenerator,
    });
    return result;
  });

  app.post("/api/v1/bolus/previews/:previewId/confirm", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { previewId } = request.params as { previewId: string };
    const body = request.body as Record<string, unknown>;

    const response = await confirmBolus(
      {
        calculationId: previewId,
        patientId,
        confirmed: true,
        confirmationTextAccepted: true,
        confirmedAt: String(body.confirmedAt ?? new Date().toISOString()),
        expectedSnapshotHash: String(body.expectedSnapshotHash ?? ""),
      },
      { auditStore: state.auditStore, calculationRepository: state.calculationRepository },
    );
    if (!response.ok) throw new HttpError(409, response.code, "The confirmation could not be completed.");
    return response.record;
  });

  app.post("/api/v1/bolus/previews/:previewId/reject", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { previewId } = request.params as { previewId: string };
    const body = request.body as Record<string, unknown>;

    const response = await rejectBolusPreview(
      {
        calculationId: previewId,
        patientId,
        rejectedAt: String(body.rejectedAt ?? new Date().toISOString()),
        reason: (body.reason as "USER_REJECTED" | "INPUT_CHANGED" | "SETTINGS_CHANGED") ?? "USER_REJECTED",
      },
      { auditStore: state.auditStore, calculationRepository: state.calculationRepository },
    );
    if (!response.ok) throw new HttpError(409, response.code, "The rejection could not be completed.");
    return response.record;
  });

  app.post("/api/v1/administrations", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;
    const response = await logConfirmedBolus(
      {
        calculationId: String(body.calculationId ?? ""),
        patientId,
        administeredUnits: String(body.administeredUnits ?? ""),
        administeredAt: String(body.administeredAt ?? new Date().toISOString()),
      },
      { auditStore: state.auditStore, calculationRepository: state.calculationRepository },
    );
    if (!response.ok) throw new HttpError(409, response.code, "The administration could not be recorded.");
    return response.record;
  });
}
