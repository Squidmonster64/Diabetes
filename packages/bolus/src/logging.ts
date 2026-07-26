/**
 * Structured, redacted operational logging helpers - handoff section 9.3 and
 * APP_BUILD_PROMPT.md section 14. Operational logs are distinct from the
 * clinical calculation audit trail (repositories.ts AuditStore) and from
 * user-visible history. Never write clinical values, tokens or secrets here.
 */

const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
  "apikey",
  "servicerolekey",
  "currentglucose",
  "carbohydrategrams",
  "icr",
  "isf",
  "targetglucose",
  "insulindurationhours",
  "doseincrementunits",
  "maximumdoseunits",
  "lowglucosethreshold",
]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(entry);
    }
    return output;
  }
  return value;
}

export interface OperationalLogEntry {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly requestId: string;
  readonly timestamp: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export function createOperationalLogEntry(
  level: OperationalLogEntry["level"],
  message: string,
  requestId: string,
  context: Record<string, unknown> = {},
): OperationalLogEntry {
  return {
    level,
    message,
    requestId,
    timestamp: new Date().toISOString(),
    context: redact(context) as Record<string, unknown>,
  };
}
