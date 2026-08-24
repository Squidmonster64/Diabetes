import type { FastifyInstance } from "fastify";
import {
  hasBlockingClarifications,
  interpretCapture,
  reviseInterpretation,
  type CaptureSourceType,
  type ProvisionalEvent,
} from "@diabetes-companion/natural-language";
import type { AppState } from "../appState.js";
import { HttpError } from "../httpError.js";
import type { CaptureRecord } from "./types.js";

function parseSourceType(value: unknown): CaptureSourceType {
  return value === "voice" ? "voice" : "typed";
}

function publicCapture(record: CaptureRecord) {
  return {
    id: record.id,
    captureCode: record.captureCode,
    clientCaptureId: record.clientCaptureId,
    sourceType: record.sourceType,
    originalText: record.originalText,
    normalisedText: record.normalisedText,
    interpretation: record.interpretation,
    acceptedSnapshot: record.acceptedSnapshot,
    interpretationStatus: record.interpretationStatus,
    intent: record.intent,
    intentConfidence: record.intentConfidence,
    contractVersion: record.contractVersion,
    referenceNow: record.referenceNow,
    interpretedAt: record.interpretedAt,
    acceptedAt: record.acceptedAt,
    rejectedAt: record.rejectedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function loadOwnedCapture(state: AppState, patientId: string, id: string): Promise<CaptureRecord> {
  const record = await state.capturesRepository.getById(id);
  if (!record || record.patientId !== patientId) {
    throw new HttpError(404, "CAPTURE_NOT_FOUND", "The requested capture was not found.");
  }
  return record;
}

export function registerCaptureRoutes(app: FastifyInstance, state: AppState): void {
  app.post("/api/v1/captures", { preHandler: app.requireAuth }, async (request, reply) => {
    const patientId = request.patientId!;
    const body = request.body as Record<string, unknown>;
    const originalText = String(body.originalText ?? "").trim() ? String(body.originalText ?? "") : "";
    if (!originalText.trim()) {
      throw new HttpError(400, "CAPTURE_TEXT_REQUIRED", "A capture must include the original spoken or typed words.");
    }
    const clientCaptureId = typeof body.clientCaptureId === "string" && body.clientCaptureId.trim() ? body.clientCaptureId.trim() : undefined;
    if (clientCaptureId) {
      const existing = await state.capturesRepository.getByClientCaptureId(patientId, clientCaptureId);
      if (existing) return publicCapture(existing);
    }
    const referenceNowMs = typeof body.referenceNowMs === "number" && Number.isFinite(body.referenceNowMs) ? body.referenceNowMs : Date.now();
    const interpretation = interpretCapture(originalText, referenceNowMs);
    const now = new Date().toISOString();
    const record = await state.capturesRepository.create(
      {
        patientId,
        sourceType: parseSourceType(body.sourceType),
        originalText,
        clientCaptureId,
        referenceNowMs,
      },
      interpretation,
      now,
    );
    await state.capturesRepository.addAction({
      captureId: record.id,
      patientId,
      actionType: "INTERPRETATION_CREATED",
      idempotencyKey: `interpretation-created:${record.id}`,
      payload: { intent: record.intent, captureCode: record.captureCode },
    });
    reply.code(201);
    return publicCapture(record);
  });

  app.get("/api/v1/captures", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const captures = await state.capturesRepository.listByPatient(patientId);
    return { captures: captures.map(publicCapture) };
  });

  app.get("/api/v1/captures/:id", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const record = await loadOwnedCapture(state, patientId, id);
    const actions = await state.capturesRepository.listActions(record.id);
    return { ...publicCapture(record), actions };
  });

  app.patch("/api/v1/captures/:id/interpretation", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const record = await loadOwnedCapture(state, patientId, id);
    if (record.interpretationStatus === "REJECTED") {
      throw new HttpError(409, "CAPTURE_REJECTED", "A rejected capture cannot be reinterpreted.");
    }
    const body = request.body as Record<string, unknown>;
    const extraction = body.extraction as ProvisionalEvent | undefined;
    if (!extraction || typeof extraction !== "object") {
      throw new HttpError(400, "INTERPRETATION_REQUIRED", "A revised interpretation must include the reviewed extraction.");
    }
    const referenceNowMs = Date.parse(record.referenceNow);
    const interpretation = reviseInterpretation(record.originalText, extraction, Number.isFinite(referenceNowMs) ? referenceNowMs : Date.now());
    const now = new Date().toISOString();
    const updated = await state.capturesRepository.updateInterpretation(
      record.id,
      {
        interpretation,
        interpretationStatus: interpretation.proposedNextStep.kind === "CLARIFY" ? "NEEDS_CLARIFICATION" : "DRAFT",
      },
      now,
    );
    await state.capturesRepository.addAction({
      captureId: record.id,
      patientId,
      actionType: "INTERPRETATION_REVISED",
      payload: { intent: updated.intent },
    });
    return publicCapture(updated);
  });

  app.post("/api/v1/captures/:id/accept", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const record = await loadOwnedCapture(state, patientId, id);
    const body = request.body as Record<string, unknown>;
    const extraction = (body.extraction as ProvisionalEvent | undefined) ?? record.interpretation.extraction;
    const referenceNowMs = Date.parse(record.referenceNow);
    const interpretation = reviseInterpretation(record.originalText, extraction, Number.isFinite(referenceNowMs) ? referenceNowMs : Date.now());
    if (hasBlockingClarifications(interpretation.extraction) || interpretation.proposedNextStep.kind === "CLARIFY") {
      throw new HttpError(409, "CLARIFICATION_REQUIRED", "Blocking questions must be answered before this capture can be accepted.");
    }
    if (interpretation.intent.intent === "SETTINGS_CHANGE_ATTEMPT") {
      const now = new Date().toISOString();
      const updated = await state.capturesRepository.updateInterpretation(
        record.id,
        {
          interpretation,
          interpretationStatus: "ACCEPTED",
          acceptedSnapshot: interpretation,
          acceptedAt: now,
        },
        now,
      );
      await state.capturesRepository.addAction({
        captureId: record.id,
        patientId,
        actionType: "SETTINGS_REDIRECT",
        idempotencyKey: `settings-redirect:${record.id}`,
        payload: { intent: updated.intent },
      });
      return publicCapture(updated);
    }
    if (interpretation.intent.intent === "EMERGENCY_OR_EXCLUDED") {
      throw new HttpError(
        409,
        "EXCLUDED_CLINICAL_CONTEXT",
        "This capture cannot be accepted for calculation. Follow your established emergency, hypo, or sick-day plan.",
      );
    }
    const now = new Date().toISOString();
    const updated = await state.capturesRepository.updateInterpretation(
      record.id,
      {
        interpretation,
        interpretationStatus: "ACCEPTED",
        acceptedSnapshot: interpretation,
        acceptedAt: now,
      },
      now,
    );
    await state.capturesRepository.addAction({
      captureId: record.id,
      patientId,
      actionType: "INTERPRETATION_ACCEPTED",
      idempotencyKey: `interpretation-accepted:${record.id}`,
      payload: { intent: updated.intent },
    });
    return publicCapture(updated);
  });

  app.post("/api/v1/captures/:id/reject", { preHandler: app.requireAuth }, async (request) => {
    const patientId = request.patientId!;
    const { id } = request.params as { id: string };
    const record = await loadOwnedCapture(state, patientId, id);
    const now = new Date().toISOString();
    const updated = await state.capturesRepository.updateInterpretation(
      record.id,
      {
        interpretation: record.interpretation,
        interpretationStatus: "REJECTED",
        rejectedAt: now,
      },
      now,
    );
    await state.capturesRepository.addAction({
      captureId: record.id,
      patientId,
      actionType: "INTERPRETATION_REJECTED",
      idempotencyKey: `interpretation-rejected:${record.id}`,
      payload: { originalTextPreserved: true },
    });
    return publicCapture(updated);
  });
}

export async function assertCaptureCanPreview(state: AppState, patientId: string, captureId: string): Promise<void> {
  const record = await state.capturesRepository.getById(captureId);
  if (!record || record.patientId !== patientId) {
    throw new HttpError(404, "CAPTURE_NOT_FOUND", "The requested capture was not found.");
  }
  if (record.interpretationStatus !== "ACCEPTED" && record.interpretationStatus !== "ACTIONED") {
    throw new HttpError(409, "INTERPRETATION_NOT_ACCEPTED", "A calculation can be linked only after the capture interpretation is accepted.");
  }
  if (!record.interpretation.intent.mayRunDeterministicPreview) {
    throw new HttpError(409, "CAPTURE_NOT_PREVIEWABLE", "This capture cannot start a deterministic preview.");
  }
}

export async function linkCaptureAction(
  state: AppState,
  patientId: string,
  captureId: string | undefined,
  actionType: "BOLUS_PREVIEW" | "BOLUS_CONFIRMED" | "BOLUS_REJECTED" | "ADMINISTRATION_RECORDED" | "SAFETY_REFUSAL",
  calculationId: string | undefined,
): Promise<void> {
  if (!captureId) return;
  const record = await state.capturesRepository.getById(captureId);
  if (!record || record.patientId !== patientId) {
    throw new HttpError(404, "CAPTURE_NOT_FOUND", "The requested capture was not found.");
  }
  if (actionType === "BOLUS_PREVIEW") {
    if (record.interpretationStatus !== "ACCEPTED" && record.interpretationStatus !== "ACTIONED") {
      throw new HttpError(409, "INTERPRETATION_NOT_ACCEPTED", "A calculation can be linked only after the capture interpretation is accepted.");
    }
    if (!record.interpretation.intent.mayRunDeterministicPreview) {
      throw new HttpError(409, "CAPTURE_NOT_PREVIEWABLE", "This capture cannot start a deterministic preview.");
    }
  }
  await state.capturesRepository.addAction({
    captureId: record.id,
    patientId,
    actionType,
    calculationId: calculationId ?? null,
    idempotencyKey: calculationId ? `${actionType}:${record.id}:${calculationId}` : `${actionType}:${record.id}:${Date.now()}`,
    payload: { captureCode: record.captureCode },
  });
  if (actionType === "BOLUS_PREVIEW" || actionType === "BOLUS_CONFIRMED" || actionType === "SAFETY_REFUSAL") {
    await state.capturesRepository.updateInterpretation(
      record.id,
      {
        interpretation: record.interpretation,
        interpretationStatus: "ACTIONED",
        acceptedSnapshot: record.acceptedSnapshot,
        acceptedAt: record.acceptedAt,
      },
      new Date().toISOString(),
    );
  }
}
