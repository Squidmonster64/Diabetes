import type { FastifyInstance } from "fastify";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";

export function registerHistoryRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/v1/history", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const events = await state.calculationRepository.listByPatient(patientId);
    return { events };
  });

  app.get("/api/v1/history/:eventId", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { eventId } = request.params as { eventId: string };
    const record = await state.calculationRepository.get(eventId);
    if (!record || record.patientId !== patientId) {
      throw new HttpError(404, "NOT_FOUND", "The requested history event was not found.");
    }
    const capture = await state.capturesRepository.findByCalculationId(eventId);
    return {
      ...record,
      capture: capture && capture.patientId === patientId
        ? {
            id: capture.id,
            captureCode: capture.captureCode,
            originalText: capture.originalText,
            intent: capture.intent,
            interpretationStatus: capture.interpretationStatus,
            createdAt: capture.createdAt,
          }
        : null,
    };
  });
}
