import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";

/**
 * PLACEHOLDER auth substrate for RBAC middleware, not a real auth system.
 * DigiVault has no login flow yet (officer/court login is step 6 —
 * frontend — and CLAUDE.md rules out production Aadhaar login entirely).
 * RBAC middleware still needs *something* to check a role against now, so
 * this issues/verifies a minimal HMAC-signed session token
 * (`userId.role.expiry` + signature) instead of trusting a raw header,
 * which would make "RBAC enforcement" trivially spoofable and not actually
 * demonstrate anything. Swap for real session issuance in step 6 — the
 * `requireRole` call sites in the API routes don't need to change either
 * way, only this file does.
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
