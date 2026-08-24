import type {
  CaptureActionType,
  CaptureInterpretation,
  CaptureIntent,
  CaptureSourceType,
  InterpretationStatus,
} from "@diabetes-companion/natural-language";

export interface CaptureRecord {
  readonly id: string;
  readonly patientId: string;
  readonly captureCode: string;
  readonly clientCaptureId: string | null;
  readonly sourceType: CaptureSourceType;
  readonly originalText: string;
  readonly normalisedText: string;
  readonly interpretation: CaptureInterpretation;
  readonly acceptedSnapshot: CaptureInterpretation | null;
  readonly interpretationStatus: InterpretationStatus;
  readonly intent: CaptureIntent;
  readonly intentConfidence: string;
  readonly contractVersion: string;
  readonly referenceNow: string;
  readonly interpretedAt: string;
  readonly acceptedAt: string | null;
  readonly rejectedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CaptureActionRecord {
  readonly id: string;
  readonly captureId: string;
  readonly patientId: string;
  readonly actionType: CaptureActionType;
  readonly calculationId: string | null;
  readonly idempotencyKey: string | null;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface CreateCaptureInput {
  readonly patientId: string;
  readonly sourceType: CaptureSourceType;
  readonly originalText: string;
  readonly clientCaptureId?: string;
  readonly referenceNowMs: number;
}

export interface CapturesRepository {
  create(input: CreateCaptureInput, interpretation: CaptureInterpretation, now: string): Promise<CaptureRecord>;
  getById(id: string): Promise<CaptureRecord | undefined>;
  getByClientCaptureId(patientId: string, clientCaptureId: string): Promise<CaptureRecord | undefined>;
  listByPatient(patientId: string): Promise<readonly CaptureRecord[]>;
  findByCalculationId(calculationId: string): Promise<CaptureRecord | undefined>;
  updateInterpretation(
    id: string,
    patch: {
      interpretation: CaptureInterpretation;
      interpretationStatus: InterpretationStatus;
      acceptedSnapshot?: CaptureInterpretation | null;
      acceptedAt?: string | null;
      rejectedAt?: string | null;
    },
    now: string,
  ): Promise<CaptureRecord>;
  addAction(action: {
    captureId: string;
    patientId: string;
    actionType: CaptureActionType;
    calculationId?: string | null;
    idempotencyKey?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<CaptureActionRecord>;
  listActions(captureId: string): Promise<readonly CaptureActionRecord[]>;
}
