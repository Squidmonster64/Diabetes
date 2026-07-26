import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  readonly port: number;
  readonly appOrigin: string;
  readonly nodeEnv: string;
  readonly databasePath: string;
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly supabaseJwtSecret: string | undefined;
  readonly supabaseServiceRoleKey: string | undefined;
  readonly useSupabase: boolean;
  readonly staticWebDir: string | undefined;
}

/**
 * Walks up from this module's own directory to find the monorepo root
 * (identified by a top-level `data/` directory), so the default database
 * path resolves correctly regardless of process.cwd() - which differs
 * between `npm run --workspace apps/api` (cwd = apps/api), a plain `node
 * dist/src/server.js` invocation, and Railway's configured start directory.
 */
function findFromModuleDir(relativeCandidate: string): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, relativeCandidate);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function findRepoRootDataPath(): string {
  // Fall back to a cwd-relative path if no repo root was found (e.g. a
  // packaged deployment where DATABASE_PATH should be set explicitly).
  return findFromModuleDir(path.join("data", "australian_foods.sqlite")) ?? path.resolve("./data/australian_foods.sqlite");
}

function findDefaultStaticWebDir(): string | undefined {
  return findFromModuleDir(path.join("apps", "web", "dist"));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = env.SUPABASE_URL || undefined;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || undefined;
  const supabaseJwtSecret = env.SUPABASE_JWT_SECRET || undefined;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  return {
    port: Number(env.PORT) || 8080,
    appOrigin: env.APP_ORIGIN || "http://localhost:5173",
    nodeEnv: env.NODE_ENV || "development",
    databasePath: env.DATABASE_PATH ? path.resolve(env.DATABASE_PATH) : findRepoRootDataPath(),
    supabaseUrl,
    supabaseAnonKey,
    supabaseJwtSecret,
    supabaseServiceRoleKey,
    useSupabase: Boolean(supabaseUrl && supabaseAnonKey && supabaseJwtSecret && supabaseServiceRoleKey),
    staticWebDir: env.STATIC_WEB_DIR ? path.resolve(env.STATIC_WEB_DIR) : findDefaultStaticWebDir(),
  };
}
