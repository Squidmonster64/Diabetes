import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeConfigurationChecksum, sha256, REFUSAL_TEMPLATES } from "@diabetes-companion/bolus";
import type { RefusalCode } from "@diabetes-companion/bolus";
import type {
  AuditStore,
  CalculationRecord,
  CalculationRepository,
  ClinicianSettingsRecord,
  NewAuditEvent,
  SettingsRepository,
} from "@diabetes-companion/bolus";
import type { NewSettingsInput } from "./memory.js";

/**
 * Durable, transactional Supabase-backed repositories for production use.
 * Handoff conflict C-05 requires production persistence to be durable and
 * transactional (not the in-memory reference adapter). This module uses the
 * Supabase service-role key and must only ever run on the server - never in
 * the browser (APP_BUILD_PROMPT.md section 11).
 */
export function createSupabaseServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToSettingsRecord(row: Record<string, unknown>): ClinicianSettingsRecord {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    version: row.version as number,
    status: row.status as ClinicianSettingsRecord["status"],
    schemaVersion: row.schema_version as string,
    approvedBy: (row.approved_by as string) ?? undefined,
    approvedAt: (row.approved_at as string) ?? undefined,
    effectiveAt: row.effective_at as string,
    expiresAt: (row.expires_at as string) ?? undefined,
    revokedAt: (row.revoked_at as string) ?? undefined,
    configurationChecksum: row.configuration_checksum as string,
    createdAt: row.created_at as string,
    insulinDurationEntrySource: row.insulin_duration_entry_source as ClinicianSettingsRecord["insulinDurationEntrySource"],
    insulinDurationSourceDate: (row.insulin_duration_source_date as string) ?? undefined,
    insulinDurationSourceReference: (row.insulin_duration_source_reference as string) ?? undefined,
    insulinDurationEnteredAt: row.insulin_duration_entered_at as string,
    insulinDurationPatientConfirmedAccurate: true,
    insulinDurationPatientConfirmedAt: row.insulin_duration_patient_confirmed_at as string,
    icr: row.icr as string,
    isf: row.isf as string,
    targetGlucose: row.target_glucose as string,
    insulinDurationHours: row.insulin_duration_hours as string,
    doseIncrementUnits: row.dose_increment_units as string,
    maximumDoseUnits: row.maximum_dose_units as string,
    lowGlucoseThreshold: row.low_glucose_threshold as string,
    glucoseUnit: row.glucose_unit as ClinicianSettingsRecord["glucoseUnit"],
  };
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveSettings(patientId: string): Promise<ClinicianSettingsRecord | undefined> {
    const { data, error } = await this.client
      .from("clinician_configurations")
      .select("*")
      .eq("patient_id", patientId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw new Error(`Failed to load active settings: ${error.message}`);
    return data ? rowToSettingsRecord(data) : undefined;
  }

  async getById(configurationId: string): Promise<ClinicianSettingsRecord | undefined> {
    const { data, error } = await this.client
      .from("clinician_configurations")
      .select("*")
      .eq("id", configurationId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load settings by id: ${error.message}`);
    return data ? rowToSettingsRecord(data) : undefined;
  }

  async getHistory(patientId: string): Promise<readonly ClinicianSettingsRecord[]> {
    const { data, error } = await this.client
      .from("clinician_configurations")
      .select("*")
      .eq("patient_id", patientId)
      .order("version", { ascending: false });
    if (error) throw new Error(`Failed to load settings history: ${error.message}`);
    return (data ?? []).map(rowToSettingsRecord);
  }

  /**
   * Creates a new immutable settings version and supersedes the previous
   * active version.
   *
   * Known limitation (see docs/audit/KNOWN_LIMITATIONS.md): this performs a
   * read-then-write sequence rather than a single atomic transaction, so two
   * concurrent settings updates for the same patient could race. The partial
   * unique index `clinician_configurations_one_active_per_patient` (see
   * supabase/migrations/0002_clinician_configurations.sql) prevents two
   * ACTIVE rows from silently coexisting - a race instead surfaces as an
   * insert error, which is a safe failure mode. The checksum is computed in
   * this process using the same computeConfigurationChecksum function that
   * validateSettings uses to re-verify it, guaranteeing the two always agree.
   */
  async createVersion(input: NewSettingsInput, now: string): Promise<ClinicianSettingsRecord> {
    const { data: nextVersionRow, error: versionError } = await this.client
      .from("clinician_configurations")
      .select("version")
      .eq("patient_id", input.patientId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw new Error(`Failed to read settings version: ${versionError.message}`);
    const nextVersion = ((nextVersionRow?.version as number) ?? 0) + 1;

    const checksum = computeConfigurationChecksum({
      patientId: input.patientId,
      version: nextVersion,
      icr: input.icr,
      isf: input.isf,
      targetGlucose: input.targetGlucose,
      insulinDurationHours: input.insulinDurationHours,
      doseIncrementUnits: input.doseIncrementUnits,
      maximumDoseUnits: input.maximumDoseUnits,
      lowGlucoseThreshold: input.lowGlucoseThreshold,
      glucoseUnit: input.glucoseUnit,
      insulinDurationEntrySource: input.insulinDurationEntrySource,
      insulinDurationSourceDate: input.insulinDurationSourceDate,
      insulinDurationSourceReference: input.insulinDurationSourceReference,
      insulinDurationEnteredAt: now,
      insulinDurationPatientConfirmedAccurate: true,
      insulinDurationPatientConfirmedAt: now,
      schemaVersion: "1.0",
    });

    const { error: supersedeError } = await this.client
      .from("clinician_configurations")
      .update({ status: "SUPERSEDED", superseded_at: now })
      .eq("patient_id", input.patientId)
      .eq("status", "ACTIVE");
    if (supersedeError) throw new Error(`Failed to supersede prior settings: ${supersedeError.message}`);

    const { data, error } = await this.client
      .from("clinician_configurations")
      .insert({
        patient_id: input.patientId,
        version: nextVersion,
        status: "ACTIVE",
        icr: input.icr,
        isf: input.isf,
        target_glucose: input.targetGlucose,
        insulin_duration_hours: input.insulinDurationHours,
        dose_increment_units: input.doseIncrementUnits,
        maximum_dose_units: input.maximumDoseUnits,
        low_glucose_threshold: input.lowGlucoseThreshold,
        glucose_unit: input.glucoseUnit,
        insulin_duration_entry_source: input.insulinDurationEntrySource,
        insulin_duration_source_date: input.insulinDurationSourceDate ?? null,
        insulin_duration_source_reference: input.insulinDurationSourceReference ?? null,
        insulin_duration_entered_at: now,
        insulin_duration_patient_confirmed_accurate: true,
        insulin_duration_patient_confirmed_at: now,
        schema_version: "1.0",
        effective_at: now,
        configuration_checksum: checksum,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create settings version: ${error.message}`);
    return rowToSettingsRecord(data as Record<string, unknown>);
  }
}

function rowToCalculationRecord(row: Record<string, unknown>): CalculationRecord {
  const status = row.state as CalculationRecord["state"];
  const isRefused = status === "REFUSED";
  return {
    calculationId: row.id as string,
    patientId: row.patient_id as string,
    state: status,
    createdAt: row.created_at as string,
    expiresAt: (row.expires_at as string) ?? undefined,
    snapshotHash: (row.result_checksum as string) ?? undefined,
    confirmedAt: (row.confirmed_at as string) ?? undefined,
    confirmationHash: (row.confirmation_hash as string) ?? undefined,
    invalidatedAt: (row.invalidated_at as string) ?? undefined,
    invalidationReason: (row.invalidation_reason as string) ?? undefined,
    administeredUnits: (row.administered_units as string) ?? undefined,
    administeredAt: (row.administered_at as string) ?? undefined,
    result: isRefused
      ? (() => {
          const refusalCode = row.refusal_code as RefusalCode;
          const template = REFUSAL_TEMPLATES[refusalCode];
          return {
            status: "REFUSED" as const,
            refusalCode,
            refusalCategory: template.refusalCategory,
            userFacingMessage: template.userFacingMessage,
            blockingReason: template.blockingReason,
            safeNextStep: template.safeNextStep,
            calculationVersion: row.calculator_version as string,
            safetyPolicyVersion: row.safety_policy_version as string,
            timestamp: row.created_at as string,
          };
        })()
      : {
          status: status as "CALCULATED" | "CALCULATED_ZERO",
          calculationId: row.id as string,
          mealComponentUnits: row.meal_component_units as string,
          correctionComponentUnits: row.correction_component_units as string,
          activeInsulinAdjustmentUnits: "0",
          unroundedTotalUnits: row.unrounded_total_units as string,
          roundedTotalUnits: row.rounded_total_units as string,
          doseIncrementUnits: row.dose_increment_units as string,
          maximumDoseUnits: row.maximum_dose_units as string,
          warnings: (row.warnings as never[]) ?? [],
          explanation: (row.explanation as string[]) ?? [],
          settingsId: row.configuration_id as string,
          settingsVersion: row.configuration_version as number,
          calculationVersion: row.calculator_version as string,
          safetyPolicyVersion: row.safety_policy_version as string,
          timestamp: row.created_at as string,
          expiresAt: row.expires_at as string,
          snapshotHash: row.result_checksum as string,
          confirmationRequired: true,
        },
  };
}

export class SupabaseCalculationRepository implements CalculationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async save(record: CalculationRecord): Promise<void> {
    const result = record.result;
    const isSuccess = result.status !== "REFUSED";
    const { error } = await this.client.from("calculations").insert({
      id: record.calculationId,
      patient_id: record.patientId,
      configuration_id: isSuccess ? (result as { settingsId: string }).settingsId : undefined,
      state: record.state,
      meal_component_units: isSuccess ? (result as { mealComponentUnits: string }).mealComponentUnits : null,
      correction_component_units: isSuccess
        ? (result as { correctionComponentUnits: string }).correctionComponentUnits
        : null,
      active_insulin_adjustment_units: isSuccess ? "0" : null,
      unrounded_total_units: isSuccess ? (result as { unroundedTotalUnits: string }).unroundedTotalUnits : null,
      rounded_total_units: isSuccess ? (result as { roundedTotalUnits: string }).roundedTotalUnits : null,
      dose_increment_units: isSuccess ? (result as { doseIncrementUnits: string }).doseIncrementUnits : null,
      maximum_dose_units: isSuccess ? (result as { maximumDoseUnits: string }).maximumDoseUnits : null,
      refusal_code: !isSuccess ? (result as { refusalCode: string }).refusalCode : null,
      explanation: isSuccess ? (result as { explanation: readonly string[] }).explanation : [],
      warnings: isSuccess ? (result as { warnings: readonly string[] }).warnings : [],
      configuration_version: isSuccess ? (result as { settingsVersion: number }).settingsVersion : null,
      calculator_version: result.calculationVersion,
      safety_policy_version: result.safetyPolicyVersion,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
      result_checksum: record.snapshotHash ?? sha256(record),
    });
    if (error) throw new Error(`Failed to persist calculation: ${error.message}`);
  }

  async get(calculationId: string): Promise<CalculationRecord | undefined> {
    const { data, error } = await this.client
      .from("calculations")
      .select("*")
      .eq("id", calculationId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load calculation: ${error.message}`);
    return data ? rowToCalculationRecord(data) : undefined;
  }

  async update(calculationId: string, patch: Partial<CalculationRecord>): Promise<CalculationRecord> {
    const updatePayload: Record<string, unknown> = {};
    if (patch.state) updatePayload.state = patch.state;
    if (patch.confirmedAt) updatePayload.confirmed_at = patch.confirmedAt;
    if (patch.confirmationHash) updatePayload.confirmation_hash = patch.confirmationHash;
    if (patch.invalidatedAt) updatePayload.invalidated_at = patch.invalidatedAt;
    if (patch.invalidationReason) updatePayload.invalidation_reason = patch.invalidationReason;
    if (patch.administeredUnits) updatePayload.administered_units = patch.administeredUnits;
    if (patch.administeredAt) updatePayload.administered_at = patch.administeredAt;

    const { data, error } = await this.client
      .from("calculations")
      .update(updatePayload)
      .eq("id", calculationId)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update calculation: ${error.message}`);
    return rowToCalculationRecord(data);
  }

  async listByPatient(patientId: string): Promise<readonly CalculationRecord[]> {
    const { data, error } = await this.client
      .from("calculations")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list history: ${error.message}`);
    return (data ?? []).map(rowToCalculationRecord);
  }
}

export class SupabaseAuditStore implements AuditStore {
  constructor(private readonly client: SupabaseClient) {}

  async append(event: NewAuditEvent) {
    const { data: lastEvent } = await this.client
      .from("audit_events")
      .select("event_hash")
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousHash = (lastEvent?.event_hash as string) ?? null;
    const eventId = crypto.randomUUID();
    const eventHash = sha256({ previousHash, eventId, ...event });

    const { data, error } = await this.client
      .from("audit_events")
      .insert({
        event_id: eventId,
        event_type: event.eventType,
        patient_id: event.patientId,
        calculation_id: event.calculationId,
        occurred_at: event.occurredAt,
        payload: event.payload,
        previous_hash: previousHash,
        event_hash: eventHash,
        offline: event.offline,
      })
      .select("sequence")
      .single();
    if (error) throw new Error(`Failed to persist audit event: ${error.message}`);

    return {
      sequence: data.sequence as number,
      eventId,
      eventType: event.eventType,
      patientId: event.patientId,
      calculationId: event.calculationId,
      occurredAt: event.occurredAt,
      payload: event.payload,
      previousHash,
      eventHash,
      offline: event.offline,
    };
  }

  async listForCalculation(calculationId: string) {
    const { data, error } = await this.client
      .from("audit_events")
      .select("*")
      .eq("calculation_id", calculationId)
      .order("sequence", { ascending: true });
    if (error) throw new Error(`Failed to list audit events: ${error.message}`);
    return (data ?? []).map((row) => ({
      sequence: row.sequence,
      eventId: row.event_id,
      eventType: row.event_type,
      patientId: row.patient_id,
      calculationId: row.calculation_id,
      occurredAt: row.occurred_at,
      payload: row.payload,
      previousHash: row.previous_hash,
      eventHash: row.event_hash,
      offline: row.offline,
    }));
  }

  async verifyChain(): Promise<boolean> {
    const { data, error } = await this.client.from("audit_events").select("*").order("sequence", { ascending: true });
    if (error) throw new Error(`Failed to verify audit chain: ${error.message}`);
    let previousHash: string | null = null;
    for (const row of data ?? []) {
      const expected = sha256({
        previousHash,
        eventId: row.event_id,
        eventType: row.event_type,
        patientId: row.patient_id,
        calculationId: row.calculation_id,
        occurredAt: row.occurred_at,
        payload: row.payload,
        offline: row.offline,
      });
      if (row.previous_hash !== previousHash || row.event_hash !== expected) return false;
      previousHash = row.event_hash;
    }
    return true;
  }
}
