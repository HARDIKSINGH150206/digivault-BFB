import type { Role } from "@prisma/client";
import { extractBearerToken, verifySessionToken, type SessionActor } from "./auth";

export class RbacError extends Error {
  constructor(
    public status: 401 | 403,
    public code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string
  ) {
    super(message);
  }
}

/**
 * Enforces the five-role RBAC model (docs/02-architecture-and-dataflow.md)
 * on a route. Every API route under src/app/api/v1 calls this before doing
 * anything else — see each route.ts for its specific allowed-roles list.
 */
export function requireRole(req: Request, allowedRoles: Role[]): SessionActor {
  const token = extractBearerToken(req);
  if (!token) {
    throw new RbacError(401, "UNAUTHENTICATED", "Missing Authorization: Bearer <token> header.");
  }

  const actor = verifySessionToken(token);
  if (!actor) {
    throw new RbacError(401, "UNAUTHENTICATED", "Invalid or expired session token.");
  }

  if (!allowedRoles.includes(actor.role)) {
    throw new RbacError(
      403,
      "FORBIDDEN",
      `Role ${actor.role} is not permitted to call this route (allowed: ${allowedRoles.join(", ")}).`
    );
  }

  return actor;
}

export function rbacErrorResponse(err: RbacError): Response {
  return Response.json({ error: err.code, message: err.message }, { status: err.status });
}
