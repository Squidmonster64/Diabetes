import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

/**
 * Black-box end-to-end tests exercising the running API over real HTTP, per
 * APP_BUILD_PROMPT.md section 15. These run against the built apps/api
 * server (not Fastify's in-process inject, used by the vitest integration
 * suite) to validate the actual deployed request/response contract.
 *
 * True browser-DOM Playwright tests of the React PWA are documented as
 * blocked in docs/audit/KNOWN_LIMITATIONS.md: the app requires a live
 * Supabase project for magic-link authentication, which is not connected in
 * this environment. Wiring a test-only auth bypass into shipped code to
 * fake that would be a security regression, so these tests instead drive
 * the same API contract the UI calls, using Playwright's request fixture.
 */
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8199",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "node dist/src/server.js",
        cwd: path.join(repoRoot, "apps/api"),
        url: "http://127.0.0.1:8199/api/v1/health",
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
          PORT: "8199",
          DATABASE_PATH: path.join(repoRoot, "data/australian_foods.sqlite"),
          APP_ORIGIN: "http://127.0.0.1:5173",
          NODE_ENV: "test",
        },
      },
});
