import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config.js";
import { openFoodDatabase } from "./db.js";
import { createAppState } from "./appState.js";
import { createAuthHook } from "./auth/requireAuth.js";
import { registerFoodRoutes } from "./food/routes.js";
import { registerSettingsRoutes } from "./settings/routes.js";
import { registerBolusRoutes } from "./bolus/routes.js";
import { registerHistoryRoutes } from "./history/routes.js";
import { registerCustomFoodRoutes } from "./customFoods/routes.js";
import { registerMealRoutes } from "./meals/routes.js";
import { registerCaptureRoutes } from "./captures/routes.js";
import { registerNutritionRoutes } from "./nutrition/routes.js";
import { HttpError } from "./httpError.js";
import { FoodModuleError } from "./food/errors.js";
import { redact } from "@diabetes-companion/bolus";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: ReturnType<typeof createAuthHook>;
  }
}

export function readExpectedDatabaseChecksum(databasePath: string): string | undefined {
  const checksumFile = path.join(path.dirname(databasePath), "..", "docs", "data-source", "australian_foods.sqlite.sha256");
  if (!existsSync(checksumFile)) return undefined;
  const contents = readFileSync(checksumFile, "utf-8").trim();
  return contents.split(/\s+/)[0];
}

export async function buildServer() {
  const config = loadConfig();

  const expectedChecksum = readExpectedDatabaseChecksum(config.databasePath);
  const { db, sha256 } = openFoodDatabase(config.databasePath, expectedChecksum);

  const state = createAppState(config, db, sha256);

  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
  });

  await app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
  });

  app.decorate("requireAuth", createAuthHook(config));

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof FoodModuleError) {
      reply.code(400).send({ error: { code: error.code, message: error.message, requestId } });
      return;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    request.log.error({ err: redact({ message, stack }) }, "unhandled_error");
    if (process.env.NODE_ENV !== "production") {
      reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message, requestId },
      });
      return;
    }
    reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId },
    });
  });

  app.get("/api/v1/health", async () => ({
    status: "ok",
    mode: config.useSupabase ? "supabase" : "memory-dev",
    databaseSha256: state.databaseSha256,
    calculatorVersion: "0.6.0",
  }));

  registerFoodRoutes(app, state);
  registerSettingsRoutes(app, state);
  registerBolusRoutes(app, state);
  registerHistoryRoutes(app, state);
  registerCustomFoodRoutes(app, state);
  registerMealRoutes(app, state);
  registerCaptureRoutes(app, state);
  registerNutritionRoutes(app, state);

  const nutritionDir = config.nutritionStaticDir && existsSync(config.nutritionStaticDir) ? config.nutritionStaticDir : undefined;
  if (nutritionDir) {
    await registerNutritionStaticApp(app, nutritionDir);
  }

  if (config.staticWebDir) {
    await registerStaticWebApp(app, config.staticWebDir, nutritionDir);
  }

  return { app, config, state };
}

async function main() {
  const { app, config } = await buildServer();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    if (!config.useSupabase) {
      app.log.warn(
        "Supabase is not configured (SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_JWT_SECRET missing). " +
          "Running with IN-MEMORY, non-durable, single-process repositories for local development only. " +
          "Do not use this mode in production.",
      );
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

function cacheHeaders(reply: { header(name: string, value: string): unknown }, filePath: string): void {
  if (filePath.endsWith("sw.js") || filePath.endsWith("registerSW.js") || filePath.endsWith("index.html")) {
    reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    reply.header("Cache-Control", "public, max-age=3600");
  }
}

async function registerNutritionStaticApp(
  app: Awaited<ReturnType<typeof buildServer>>["app"],
  nutritionDir: string,
): Promise<void> {
  await app.register(fastifyStatic, {
    root: nutritionDir,
    prefix: "/nutrition/",
    decorateReply: false,
    wildcard: false,
    setHeaders: cacheHeaders,
  });
}

/**
 * Serves the built PWA as static files with an SPA fallback, so a single
 * Railway service can host both the API and the web app - APP_BUILD_PROMPT.md
 * section 19. Cache headers distinguish the service worker and index.html
 * (never cached, so updates and safety-relevant fixes propagate immediately)
 * from content-hashed assets (cached long-term/immutable).
 */
async function registerStaticWebApp(
  app: Awaited<ReturnType<typeof buildServer>>["app"],
  staticWebDir: string,
  nutritionDir: string | undefined,
): Promise<void> {
  await app.register(fastifyStatic, {
    root: staticWebDir,
    wildcard: false,
    setHeaders: cacheHeaders,
  });

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? "";
    if (url.startsWith("/api/")) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found.", requestId: request.id } });
      return;
    }
    if (nutritionDir && url.startsWith("/nutrition")) {
      reply.header("Cache-Control", "no-cache, no-store, must-revalidate").type("text/html").send(readFileSync(path.join(nutritionDir, "index.html")));
      return;
    }
    reply.header("Cache-Control", "no-cache, no-store, must-revalidate").sendFile("index.html");
  });
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  void main();
}
