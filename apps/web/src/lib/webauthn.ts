import { issueScopedToken, verifyScopedToken } from "./auth";

/**
 * Relying-party identity. Defaults to the Host the browser used, so the
 * same build works on localhost and on a demo hostname; set
 * WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN to pin it. A relayed (phishing) request
 * still fails: the authenticator signs the page's real origin, which won't
 * match ours.
 */
export function relyingParty(req: Request): { rpID: string; origin: string; rpName: string } {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
    rpName: "DigiVault",
    rpID: process.env.WEBAUTHN_RP_ID ?? host.split(":")[0],
    origin: process.env.WEBAUTHN_ORIGIN ?? `${proto}://${host}`,
  };
}

const CHALLENGE_TTL_SECONDS = 2 * 60;

/**
 * Challenges are carried by the client in a signed token rather than kept
 * in server memory, so any route bundle can verify them. Each challenge
 * is single-use (tracked below until it would have expired anyway).
 */
export function issueChallengeToken(userId: string, purpose: "register" | "authenticate", challenge: string): string {
  return issueScopedToken(`webauthn-${purpose}`, { u: userId, c: challenge }, CHALLENGE_TTL_SECONDS);
}

const globalForChallenges = globalThis as unknown as { __digivaultUsedChallenges?: Map<string, number> };
const usedChallenges = (globalForChallenges.__digivaultUsedChallenges ??= new Map<string, number>());

/** Returns the challenge if the token is valid, unexpired, unused and belongs to userId; marks it used. */
export function consumeChallengeToken(
  token: unknown,
  userId: string,
  purpose: "register" | "authenticate"
): string | null {
  if (typeof token !== "string") return null;
  const claims = verifyScopedToken(`webauthn-${purpose}`, token);
  if (!claims || claims.u !== userId) return null;

  const now = Date.now();
  for (const [c, expiresAt] of usedChallenges) if (expiresAt <= now) usedChallenges.delete(c);
  if (usedChallenges.has(claims.c)) return null;
  usedChallenges.set(claims.c, now + CHALLENGE_TTL_SECONDS * 1000);
  return claims.c;
}
