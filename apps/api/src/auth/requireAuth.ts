import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySupabaseAccessToken, AuthenticationError } from "./verifyJwt.js";
import type { AppConfig } from "../config.js";
import { HttpError } from "../httpError.js";

declare module "fastify" {
  interface FastifyRequest {
    patientId?: string;
    accessToken?: string;
  }
}

/**
 * Resolves the authenticated patient id from a verified Supabase access
 * token. Never reads a patient/user id from the request body or query -
 * APP_BUILD_PROMPT.md section 11. In local development without Supabase
 * configured, an explicit X-Dev-Patient-Id header is accepted so the app can
 * be exercised without a live Supabase project; this fallback is refused
 * outright when running with NODE_ENV=production.
 */
export function createAuthHook(config: AppConfig) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!config.useSupabase) {
      if (config.nodeEnv === "production") {
        throw new HttpError(500, "SERVER_MISCONFIGURED", "Supabase authentication is not configured.");
      }
      const devPatientId = request.headers["x-dev-patient-id"];
      if (typeof devPatientId === "string" && devPatientId.length > 0) {
        request.patientId = devPatientId;
        return;
      }
      throw new HttpError(401, "UNAUTHENTICATED", "Missing X-Dev-Patient-Id header in development mode.");
    }

    try {
      const identity = await verifySupabaseAccessToken(request.headers.authorization, config.supabaseJwtSecret!);
      request.patientId = identity.patientId;
      request.accessToken = identity.accessToken;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw new HttpError(401, "UNAUTHENTICATED", error.message);
      }
      throw error;
    }
  };
}
