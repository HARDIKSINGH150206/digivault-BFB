import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";

/**
 * HMAC-signed session tokens (`userId.role.expiry` + signature), issued by
 * /api/auth/login after a Service Number + PIN check and sent back as
 * `Authorization: Bearer`. `requireRole` in lib/rbac.ts verifies them.
 */

export interface SessionActor {
  userId: string;
  role: Role;
}

const SECRET = process.env.AUTH_SESSION_SECRET;

function sign(payload: string): string {
  if (!SECRET) {
    throw new Error("AUTH_SESSION_SECRET is not set");
  }
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function issueSessionToken(actor: SessionActor, ttlSeconds = 3600): string {
  const expiry = Date.now() + ttlSeconds * 1000;
  const payload = `${actor.userId}.${actor.role}.${expiry}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifySessionToken(token: string): SessionActor | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [userId, role, expiryStr, sig] = parts;

    const expected = sign(`${userId}.${role}.${expiryStr}`);
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    if (Date.now() > Number(expiryStr)) return null;

    return { userId, role: role as Role };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

/**
 * Short-lived signed tokens for things other than the session (step-up
 * proof, WebAuthn challenges). Each scope gets its own HMAC key derived
 * from AUTH_SESSION_SECRET, so a token from one scope never verifies in
 * another, or as a session token.
 */
function scopedSign(scope: string, payload: string): string {
  if (!SECRET) {
    throw new Error("AUTH_SESSION_SECRET is not set");
  }
  const key = createHmac("sha256", SECRET).update(`digivault:${scope}`).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueScopedToken(scope: string, claims: Record<string, string>, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${scopedSign(scope, payload)}`;
}

export function verifyScopedToken(scope: string, token: string): Record<string, string> | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(scopedSign(scope, payload), "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof claims.exp !== "number" || Date.now() > claims.exp) return null;
    const { exp: _exp, ...rest } = claims;
    return rest as Record<string, string>;
  } catch {
    return null;
  }
}
