import type Database from "better-sqlite3";
import { InMemoryAuditStore, type AuditStore, type CalculationRepository, type CalculationRecord } from "@diabetes-companion/bolus";
import type { AppConfig } from "./config.js";
import { MemoryCalculationRepository, MemorySettingsRepository } from "./repositories/memory.js";
import {
  createSupabaseServiceClient,
  SupabaseAuditStore,
  SupabaseCalculationRepository,
  SupabaseSettingsRepository,
} from "./repositories/supabase.js";

export interface AppState {
  readonly config: AppConfig;
  readonly db: InstanceType<typeof Database>;
  readonly databaseSha256: string;
  readonly settingsRepository: MemorySettingsRepository | SupabaseSettingsRepository;
  readonly calculationRepository: CalculationRepository & {
    listByPatient(patientId: string): Promise<readonly CalculationRecord[]>;
  };
  readonly auditStore: AuditStore;
}

/**
 * Builds the application state, selecting durable Supabase-backed
 * repositories when Supabase credentials are configured, and falling back to
 * in-memory repositories for local development only (handoff conflict C-05:
 * the in-memory adapter must never be used in production).
 */
export function createAppState(config: AppConfig, db: InstanceType<typeof Database>, databaseSha256: string): AppState {
  if (config.useSupabase) {
    const client = createSupabaseServiceClient(config.supabaseUrl!, config.supabaseServiceRoleKey!);
    return {
      config,
      db,
      databaseSha256,
      settingsRepository: new SupabaseSettingsRepository(client),
      calculationRepository: new SupabaseCalculationRepository(client),
      auditStore: new SupabaseAuditStore(client),
    };
  }

  return {
    config,
    db,
    databaseSha256,
    settingsRepository: new MemorySettingsRepository(),
    calculationRepository: new MemoryCalculationRepository(),
    auditStore: new InMemoryAuditStore(),
  };
}
