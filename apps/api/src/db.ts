import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";

export interface DatabaseHandle {
  readonly db: InstanceType<typeof Database>;
  readonly sha256: string;
}

/**
 * Opens the Australian food database read-only and verifies its SHA-256
 * checksum against the recorded value before returning it. Fails startup
 * clearly if the database is missing or corrupted - APP_BUILD_PROMPT.md
 * section 19.
 */
export function openFoodDatabase(databasePath: string, expectedSha256?: string): DatabaseHandle {
  if (!existsSync(databasePath)) {
    throw new Error(`Australian food database not found at ${databasePath}`);
  }
  const fileBuffer = readFileSync(databasePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  if (expectedSha256 && expectedSha256 !== sha256) {
    throw new Error(
      `Australian food database checksum mismatch: expected ${expectedSha256}, got ${sha256}. Refusing to start.`,
    );
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`Australian food database failed integrity_check: ${integrity}`);
  }
  return { db, sha256 };
}
