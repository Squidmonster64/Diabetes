import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureInterpretation } from "@diabetes-companion/natural-language";
import type {
  CaptureActionRecord,
  CaptureRecord,
  CapturesRepository,
  CreateCaptureInput,
} from "./types.js";
import type { InterpretationStatus } from "@diabetes-companion/natural-language";

function rowToCapture(row: Record<string, unknown>): CaptureRecord {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    captureCode: row.capture_code as string,
    clientCaptureId: (row.client_capture_id as string) ?? null,
    sourceType: row.source_type as CaptureRecord["sourceType"],
    originalText: row.original_text as string,
    normalisedText: row.normalised_text as string,
    interpretation: row.interpretation_json as CaptureInterpretation,
    acceptedSnapshot: (row.accepted_snapshot_json as CaptureInterpretation | null) ?? null,
    interpretationStatus: row.interpretation_status as CaptureRecord["interpretationStatus"],
    intent: row.intent as CaptureRecord["intent"],
    intentConfidence: row.intent_confidence as string,
    contractVersion: row.contract_version as string,
    referenceNow: row.reference_now as string,
    interpretedAt: row.interpreted_at as string,
    acceptedAt: (row.accepted_at as string) ?? null,
    rejectedAt: (row.rejected_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToAction(row: Record<string, unknown>): CaptureActionRecord {
  return {
    id: row.id as string,
    captureId: row.capture_id as string,
    patientId: row.patient_id as string,
    actionType: row.action_type as CaptureActionRecord["actionType"],
    calculationId: (row.calculation_id as string) ?? null,
    idempotencyKey: (row.idempotency_key as string) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

export class SupabaseCapturesRepository implements CapturesRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async nextCaptureCode(patientId: string): Promise<string> {
    const { data, error } = await this.client
      .from("captures")
      .select("capture_code")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Failed to allocate capture code: ${error.message}`);
    let max = 0;
    for (const row of data ?? []) {
      const match = /^D(\d+)$/.exec(String((row as { capture_code: string }).capture_code));
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `D${String(max + 1).padStart(3, "0")}`;
  }

  async create(input: CreateCaptureInput, interpretation: CaptureInterpretation, now: string): Promise<CaptureRecord> {
    if (input.clientCaptureId) {
      const existing = await this.getByClientCaptureId(input.patientId, input.clientCaptureId);
      if (existing) return existing;
    }
    const captureCode = await this.nextCaptureCode(input.patientId);
    const status = interpretation.proposedNextStep.kind === "CLARIFY" ? "NEEDS_CLARIFICATION" : "DRAFT";
    const { data, error } = await this.client
      .from("captures")
      .insert({
        patient_id: input.patientId,
        capture_code: captureCode,
        client_capture_id: input.clientCaptureId ?? null,
        source_type: input.sourceType,
        original_text: input.originalText,
        normalised_text: interpretation.normalisedText,
        interpretation_json: interpretation,
        interpretation_status: status,
        intent: interpretation.intent.intent,
        intent_confidence: String(interpretation.intent.confidence),
        contract_version: interpretation.contractVersion,
        reference_now: interpretation.referenceNow,
        interpreted_at: now,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create capture: ${error.message}`);
    return rowToCapture(data);
  }

  async getById(id: string): Promise<CaptureRecord | undefined> {
    const { data, error } = await this.client.from("captures").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load capture: ${error.message}`);
    return data ? rowToCapture(data) : undefined;
  }

  async getByClientCaptureId(patientId: string, clientCaptureId: string): Promise<CaptureRecord | undefined> {
    const { data, error } = await this.client
      .from("captures")
      .select("*")
      .eq("patient_id", patientId)
      .eq("client_capture_id", clientCaptureId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load capture by client id: ${error.message}`);
    return data ? rowToCapture(data) : undefined;
  }

  async listByPatient(patientId: string): Promise<readonly CaptureRecord[]> {
    const { data, error } = await this.client
      .from("captures")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list captures: ${error.message}`);
    return (data ?? []).map(rowToCapture);
  }

  async findByCalculationId(calculationId: string): Promise<CaptureRecord | undefined> {
    const { data, error } = await this.client
      .from("capture_actions")
      .select("capture_id")
      .eq("calculation_id", calculationId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up capture by calculation: ${error.message}`);
    if (!data) return undefined;
    return this.getById((data as { capture_id: string }).capture_id);
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
    const updatePayload: Record<string, unknown> = {
      interpretation_json: patch.interpretation,
      interpretation_status: patch.interpretationStatus,
      intent: patch.interpretation.intent.intent,
      intent_confidence: String(patch.interpretation.intent.confidence),
      updated_at: now,
    };
    if (patch.acceptedSnapshot !== undefined) updatePayload.accepted_snapshot_json = patch.acceptedSnapshot;
    if (patch.acceptedAt !== undefined) updatePayload.accepted_at = patch.acceptedAt;
    if (patch.rejectedAt !== undefined) updatePayload.rejected_at = patch.rejectedAt;
    const { data, error } = await this.client.from("captures").update(updatePayload).eq("id", id).select("*").single();
    if (error) throw new Error(`Failed to update capture interpretation: ${error.message}`);
    return rowToCapture(data);
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
      const { data: existing, error: existingError } = await this.client
        .from("capture_actions")
        .select("*")
        .eq("patient_id", action.patientId)
        .eq("idempotency_key", action.idempotencyKey)
        .maybeSingle();
      if (existingError) throw new Error(`Failed to check capture action idempotency: ${existingError.message}`);
      if (existing) return rowToAction(existing);
    }
    const { data, error } = await this.client
      .from("capture_actions")
      .insert({
        capture_id: action.captureId,
        patient_id: action.patientId,
        action_type: action.actionType,
        calculation_id: action.calculationId ?? null,
        idempotency_key: action.idempotencyKey ?? null,
        payload: action.payload ?? {},
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to record capture action: ${error.message}`);
    return rowToAction(data);
  }

  async listActions(captureId: string): Promise<readonly CaptureActionRecord[]> {
    const { data, error } = await this.client
      .from("capture_actions")
      .select("*")
      .eq("capture_id", captureId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Failed to list capture actions: ${error.message}`);
    return (data ?? []).map(rowToAction);
  }
}
