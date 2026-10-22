import type { IncomingMessage } from "http";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Fork: Cloudflare Access JWT check for the HTTP transports.
 *
 * Every request that passed the origin's Access application carries a signed
 * `Cf-Access-Jwt-Assertion` header. Verifying it means that reaching the port
 * directly, without going through Cloudflare, gets nothing. Returns null (no
 * check) only when ALLOW_WITHOUT_ACCESS_JWT=true, for local development.
 */
export function accessJwtCheck(
  env: NodeJS.ProcessEnv = process.env,
): ((req: IncomingMessage) => Promise<boolean>) | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    if (env.ALLOW_WITHOUT_ACCESS_JWT === "true") return null;
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are required " +
        "(set ALLOW_WITHOUT_ACCESS_JWT=true for local development only)",
    );
  }
  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  return async (req) => {
    const token = req.headers["cf-access-jwt-assertion"];
    if (typeof token !== "string" || !token) return false;
    try {
      await jwtVerify(token, jwks, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat"],
      });
      return true;
    } catch {
      return false;
    }
  };
}
