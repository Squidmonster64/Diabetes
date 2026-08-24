import { randomUUID } from "node:crypto";
import type { CaptureInterpretation, InterpretationStatus } from "@diabetes-companion/natural-language";
import type {
  CaptureActionRecord,
  CaptureRecord,
  CapturesRepository,
  CreateCaptureInput,
} from "./types.js";

function nextCaptureCode(existing: readonly CaptureRecord[]): string {
  let max = 0;
  for (const record of existing) {
    const match = /^D(\d+)$/.exec(record.captureCode);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `D${String(max + 1).padStart(3, "0")}`;
}

function cloneInterpretation(interpretation: CaptureInterpretation): CaptureInterpretation {
  return structuredClone(interpretation);
}

/**
 * In-memory captures for local development only. Production must use the
 * Supabase-backed repository so original text is durable.
 */
export class MemoryCapturesRepository implements CapturesRepository {
  private readonly byId = new Map<string, CaptureRecord>();
  private readonly actions = new Map<string, CaptureActionRecord[]>();

  async create(input: CreateCaptureInput, interpretation: CaptureInterpretation, now: string): Promise<CaptureRecord> {
    if (input.clientCaptureId) {
      const existing = await this.getByClientCaptureId(input.patientId, input.clientCaptureId);
      if (existing) return existing;
    }
    const patientCaptures = [...this.byId.values()].filter((record) => record.patientId === input.patientId);
    const record: CaptureRecord = {
      id: randomUUID(),
      patientId: input.patientId,
      captureCode: nextCaptureCode(patientCaptures),
      clientCaptureId: input.clientCaptureId ?? null,
      sourceType: input.sourceType,
      originalText: input.originalText,
      normalisedText: interpretation.normalisedText,
      interpretation: cloneInterpretation(interpretation),
      acceptedSnapshot: null,
      interpretationStatus: interpretation.proposedNextStep.kind === "CLARIFY" ? "NEEDS_CLARIFICATION" : "DRAFT",
      intent: interpretation.intent.intent,
      intentConfidence: String(interpretation.intent.confidence),
      contractVersion: interpretation.contractVersion,
      referenceNow: interpretation.referenceNow,
      interpretedAt: now,
      acceptedAt: null,
      rejectedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<CaptureRecord | undefined> {
    return this.byId.get(id);
  }

  async getByClientCaptureId(patientId: string, clientCaptureId: string): Promise<CaptureRecord | undefined> {
    return [...this.byId.values()].find(
      (record) => record.patientId === patientId && record.clientCaptureId === clientCaptureId,
    );
  }

  async listByPatient(patientId: string): Promise<readonly CaptureRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByCalculationId(calculationId: string): Promise<CaptureRecord | undefined> {
    for (const [captureId, actions] of this.actions) {
      if (actions.some((action) => action.calculationId === calculationId)) {
        return this.byId.get(captureId);
      }
    }
    return undefined;
  }

  async updateInterpretation(
    id: string,
    patch: {
      interpretation: CaptureInterpretation;
      interpretationStatus: InterpretationStatus;
      acceptedSnapshot?: CaptureInterpretation | null;
      acceptedAt?: string | null;
      rejectedAt?: string | null;
    },
    now: string,
  ): Promise<CaptureRecord> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error("Capture not found");
    const updated: CaptureRecord = {
      ...existing,
      interpretation: cloneInterpretation(patch.interpretation),
      interpretationStatus: patch.interpretationStatus,
      intent: patch.interpretation.intent.intent,
      intentConfidence: String(patch.interpretation.intent.confidence),
      acceptedSnapshot:
        patch.acceptedSnapshot === undefined
          ? existing.acceptedSnapshot
          : patch.acceptedSnapshot
            ? cloneInterpretation(patch.acceptedSnapshot)
            : null,
      acceptedAt: patch.acceptedAt === undefined ? existing.acceptedAt : patch.acceptedAt,
      rejectedAt: patch.rejectedAt === undefined ? existing.rejectedAt : patch.rejectedAt,
      updatedAt: now,
    };
    this.byId.set(id, updated);
    return updated;
  }

  async addAction(action: {
    captureId: string;
    patientId: string;
    actionType: CaptureActionRecord["actionType"];
    calculationId?: string | null;
    idempotencyKey?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<CaptureActionRecord> {
    if (action.idempotencyKey) {
      const existing = (this.actions.get(action.captureId) ?? []).find(
        (record) => record.patientId === action.patientId && record.idempotencyKey === action.idempotencyKey,
      );
      if (existing) return existing;
    }
    const record: CaptureActionRecord = {
      id: randomUUID(),
      captureId: action.captureId,
      patientId: action.patientId,
      actionType: action.actionType,
      calculationId: action.calculationId ?? null,
      idempotencyKey: action.idempotencyKey ?? null,
      payload: action.payload ?? {},
      createdAt: new Date().toISOString(),
    };
    const list = this.actions.get(action.captureId) ?? [];
    list.push(record);
    this.actions.set(action.captureId, list);
    return record;
  }

  async listActions(captureId: string): Promise<readonly CaptureActionRecord[]> {
    return [...(this.actions.get(captureId) ?? [])];
  }
}
