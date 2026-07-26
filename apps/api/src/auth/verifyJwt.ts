import { jwtVerify } from "jose";

export interface AuthenticatedIdentity {
  readonly patientId: string;
  readonly accessToken: string;
}

export class AuthenticationError extends Error {}

/**
 * Verifies a Supabase-issued access token and extracts the authenticated
 * user id. Never trusts a patient/user id supplied in request JSON -
 * APP_BUILD_PROMPT.md section 11.
 */
export async function verifySupabaseAccessToken(
  authorizationHeader: string | undefined,
  jwtSecret: string,
): Promise<AuthenticatedIdentity> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing bearer token.");
  }
  const accessToken = authorizationHeader.slice("Bearer ".length).trim();
  if (!accessToken) throw new AuthenticationError("Empty bearer token.");

  try {
    const secretKey = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(accessToken, secretKey, {
      algorithms: ["HS256"],
    });
    const patientId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!patientId) throw new AuthenticationError("Token has no subject claim.");
    return { patientId, accessToken };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError("Token verification failed.");
  }
}
