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

/**
 * Serialises concurrent confirmation requests for one patient/preview within
 * this API process. The durable calculation state remains the authority, so a
 * later retry returns the existing record rather than creating another one.
 */
const confirmationsInFlight = new Map<string, Promise<unknown>>();

export function registerBolusRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/bolus/preview", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;
    const serverNow = systemClock.now();

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
      activeInsulinUnits: body.activeInsulinUnits === null || body.activeInsulinUnits === undefined ? null : String(body.activeInsulinUnits),
      recentHistoryComplete: body.recentHistoryComplete === true,
      priorRapidActingDoses: Array.isArray(body.priorRapidActingDoses) ? (body.priorRapidActingDoses as { units: string; administeredAt: string }[]) : [],
      hypoSymptoms: body.hypoSymptoms === true,
      duplicateDose: body.duplicateDose === true,
      specialSituations: Array.isArray(body.specialSituations) ? (body.specialSituations as BolusCalculationRequest["specialSituations"]) : [],
      concentratedInsulinConfirmed: body.concentratedInsulinConfirmed === true,
      // Client clocks never decide preview freshness or expiry.
      calculatedAt: serverNow,
    };

    const context: SafetyContext = {
      authenticatedPatientId: patientId,
      patientIsAdult: request.headers["x-patient-is-adult"] !== "false",
      serverNow,
    };

    const result = await calculateBolusPreview(bolusRequest, context, {
      settingsRepository: state.settingsRepository,
      auditStore: state.auditStore,
      calculationRepository: state.calculationRepository,
      clock: systemClock,
      idGenerator: uuidGenerator,
    });
    return { ...result, serverNow };
  });

  app.post("/api/v1/bolus/previews/:previewId/confirm", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { previewId } = request.params as { previewId: string };
    const body = request.body as Record<string, unknown>;
    const requestKey = `${patientId}:${previewId}`;
    const inFlight = confirmationsInFlight.get(requestKey);
    if (inFlight) return await inFlight;

    const confirmationRequestId = String(body.confirmationRequestId ?? "");
    const responsePromise = (async () => {
      const serverNow = systemClock.now();
      const response = await confirmBolus(
        {
          calculationId: previewId,
          patientId,
          confirmed: true,
          confirmationTextAccepted: true,
          // Gate 38 uses trusted server time, not an untrusted browser timestamp.
          confirmedAt: serverNow,
          expectedSnapshotHash: String(body.expectedSnapshotHash ?? ""),
        },
        { auditStore: state.auditStore, calculationRepository: state.calculationRepository },
      );
      if (!response.ok && response.code === "DUPLICATE_CONFIRMATION") {
        const existing = await state.calculationRepository.get(previewId);
        if (existing && existing.patientId === patientId) {
          return { ...existing, status: "DUPLICATE_CONFIRMATION" as const, record: existing, confirmationRequestId, serverNow };
        }
      }
      if (!response.ok) throw new HttpError(409, response.code, "The confirmation could not be completed.");
      return { ...response.record, status: response.record.state, record: response.record, confirmationRequestId, serverNow };
    })();

    confirmationsInFlight.set(requestKey, responsePromise);
    try {
      return await responsePromise;
    } finally {
      if (confirmationsInFlight.get(requestKey) === responsePromise) confirmationsInFlight.delete(requestKey);
    }
  });

  app.post("/api/v1/bolus/previews/:previewId/reject", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { previewId } = request.params as { previewId: string };
    const body = request.body as Record<string, unknown>;
    const response = await rejectBolusPreview(
      {
        calculationId: previewId,
        patientId,
        rejectedAt: systemClock.now(),
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
        administeredAt: systemClock.now(),
      },
      { auditStore: state.auditStore, calculationRepository: state.calculationRepository },
    );
    if (!response.ok) throw new HttpError(409, response.code, "The administration could not be recorded.");
    return response.record;
  });
}
