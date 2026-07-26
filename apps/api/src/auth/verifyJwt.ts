import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

export interface AuthenticatedIdentity {
  readonly patientId: string;
  readonly accessToken: string;
}

export class AuthenticationError extends Error {}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwks(supabaseUrl: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

/**
 * Verifies a Supabase-issued access token and extracts the authenticated
 * user id. Never trusts a patient/user id supplied in request JSON -
 * APP_BUILD_PROMPT.md section 11.
 *
 * Supabase projects created with the newer "JWT signing keys" feature issue
 * asymmetric ES256 tokens verifiable via the project's JWKS endpoint; older
 * projects (or ones that haven't rotated) issue HS256 tokens signed with the
 * legacy shared JWT secret. This tries JWKS verification first and falls
 * back to the legacy HS256 secret so either configuration works without the
 * caller needing to know which one their project uses.
 */
export async function verifySupabaseAccessToken(
  authorizationHeader: string | undefined,
  supabaseUrl: string,
  legacyJwtSecret: string | undefined,
): Promise<AuthenticatedIdentity> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing bearer token.");
  }
  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  if (!accessToken) throw new AuthenticationError("Empty bearer token.");

  let payload: Record<string, unknown> | undefined;

  try {
    const result = await jwtVerify(accessToken, getJwks(supabaseUrl), {
      algorithms: ["ES256", "RS256"],
    });
    payload = result.payload;
  } catch {
    if (legacyJwtSecret) {
      try {
        const secretKey = new TextEncoder().encode(legacyJwtSecret);
        const result = await jwtVerify(accessToken, secretKey, { algorithms: ["HS256"] });
        payload = result.payload;
      } catch {
        throw new AuthenticationError("Token verification failed.");
      }
    } else {
      throw new AuthenticationError("Token verification failed.");
    }
  }

  const patientId = typeof payload?.sub === "string" ? payload.sub : undefined;
  if (!patientId) throw new AuthenticationError("Token has no subject claim.");
  return { patientId, accessToken };
}
