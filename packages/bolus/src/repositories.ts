import { createHash, randomUUID } from "node:crypto";
import type { BolusPreviewResult, ClinicianSettingsRecord } from "./types.js";

export type AuditEventType =
  | "CALCULATION_STARTED"
  | "CALCULATION_REFUSED"
  | "CALCULATION_COMPLETED"
  | "CALCULATION_VIEWED"
  | "CALCULATION_CONFIRMED"
  | "CALCULATION_EXPIRED"
  | "CALCULATION_INVALIDATED"
  | "ADMINISTRATION_RECORDED"
  | "CONFIGURATION_CREATED"
  | "CONFIGURATION_APPROVED"
  | "CONFIGURATION_ACTIVATED"
  | "CONFIGURATION_REVOKED";

export interface AuditEvent {
  readonly sequence: number;
  readonly eventId: string;
  readonly eventType: AuditEventType;
  readonly patientId: string;
  readonly calculationId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly previousHash: string | null;
  readonly eventHash: string;
  readonly offline: boolean;
}

export type NewAuditEvent = Omit<AuditEvent, "sequence" | "previousHash" | "eventHash" | "eventId">;

/**
 * Durable append-only audit store contract. Handoff conflict C-05 requires
 * production persistence to be transactional and durable - apps/api supplies
 * a Postgres/Supabase-backed implementation. The in-memory implementation
 * below is a test/reference double only and must not be deployed.
 */
export interface AuditStore {
  append(event: NewAuditEvent): Promise<AuditEvent>;
  listForCalculation(calculationId: string): Promise<readonly AuditEvent[]>;
  verifyChain(): Promise<boolean>;
}

export interface SettingsRepository {
  getActiveSettings(patientId: string): Promise<ClinicianSettingsRecord | undefined>;
  getById(configurationId: string): Promise<ClinicianSettingsRecord | undefined>;
}

export type CalculationState =
  | "REFUSED"
  | "CALCULATED"
  | "CALCULATED_ZERO"
  | "USER_CONFIRMED"
  | "EXPIRED"
  | "INVALIDATED"
  | "ADMINISTRATION_RECORDED";

export interface CalculationRecord {
  readonly calculationId: string;
  readonly patientId: string;
  readonly state: CalculationState;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly result: BolusPreviewResult;
  readonly snapshotHash?: string;
  readonly confirmedAt?: string;
  readonly confirmationHash?: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: string;
  readonly administeredUnits?: string;
  readonly administeredAt?: string;
}

export interface CalculationRepository {
  save(record: CalculationRecord): Promise<void>;
  get(calculationId: string): Promise<CalculationRecord | undefined>;
  update(calculationId: string, patch: Partial<CalculationRecord>): Promise<CalculationRecord>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  newId(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
export const uuidGenerator: IdGenerator = { newId: () => randomUUID() };

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalise(object[key])}`)
    .join(",")}}`;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalise(value)).digest("hex");
}

/** Reference/test-only in-memory audit store. Do not deploy - see handoff conflict C-05. */
export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];
  private shouldFailNextAppend = false;

  /** Test hook for the audit-persistence-failure fault-injection gate. */
  failNextAppend(): void {
    this.shouldFailNextAppend = true;
  }

  async append(event: NewAuditEvent): Promise<AuditEvent> {
    if (this.shouldFailNextAppend) {
      this.shouldFailNextAppend = false;
      throw new Error("Simulated audit persistence failure");
    }
    const previousHash = this.events.at(-1)?.eventHash ?? null;
    const sequence = this.events.length + 1;
    const eventId = randomUUID();
    const eventHash = sha256({ sequence, previousHash, eventId, ...event });
    const stored: AuditEvent = Object.freeze({ ...event, eventId, sequence, previousHash, eventHash });
    this.events.push(stored);
    return stored;
  }

  async listForCalculation(calculationId: string): Promise<readonly AuditEvent[]> {
    return this.events.filter((event) => event.calculationId === calculationId);
  }

  async verifyChain(): Promise<boolean> {
    let previousHash: string | null = null;
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      if (!event) return false;
      const expected = sha256({
        sequence: event.sequence,
        previousHash,
        eventId: event.eventId,
        eventType: event.eventType,
        patientId: event.patientId,
        calculationId: event.calculationId,
        occurredAt: event.occurredAt,
        payload: event.payload,
        offline: event.offline,
      });
      if (event.sequence !== index + 1 || event.previousHash !== previousHash || event.eventHash !== expected) {
        return false;
      }
      previousHash = event.eventHash;
    }
    return true;
  }

  /** Test-only: tamper with a stored event to verify verifyChain() detects it. */
  tamperForTest(index: number, patch: Partial<AuditEvent>): void {
    const existing = this.events[index];
    if (!existing) return;
    this.events[index] = Object.freeze({ ...existing, ...patch });
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly byPatient = new Map<string, ClinicianSettingsRecord>();
  private readonly byId = new Map<string, ClinicianSettingsRecord>();

  set(settings: ClinicianSettingsRecord): void {
    this.byId.set(settings.id, settings);
    if (settings.status === "ACTIVE") this.byPatient.set(settings.patientId, settings);
  }

  async getActiveSettings(patientId: string): Promise<ClinicianSettingsRecord | undefined> {
    return this.byPatient.get(patientId);
  }

  async getById(configurationId: string): Promise<ClinicianSettingsRecord | undefined> {
    return this.byId.get(configurationId);
  }
}

export class InMemoryCalculationRepository implements CalculationRepository {
  private readonly records = new Map<string, CalculationRecord>();

  async save(record: CalculationRecord): Promise<void> {
    this.records.set(record.calculationId, record);
  }

  async get(calculationId: string): Promise<CalculationRecord | undefined> {
    return this.records.get(calculationId);
  }

  async update(calculationId: string, patch: Partial<CalculationRecord>): Promise<CalculationRecord> {
    const existing = this.records.get(calculationId);
    if (!existing) throw new Error("Calculation not found");
    const updated = { ...existing, ...patch };
    this.records.set(calculationId, updated);
    return updated;
  }
}
