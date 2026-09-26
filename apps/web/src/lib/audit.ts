import { prisma } from "./prisma";

/**
 * The ONLY way any route writes to AuditLog — a bare `prisma.auditLog.create`.
 * There is deliberately no updateAuditLog/deleteAuditLog export here, and no
 * API route anywhere exposes update/delete for this model (Part 3 of the
 * step-4 backend work, insider-threat story — see CLAUDE.md and the audit
 * report). This is the application-layer half of "insert-only"; the DB-level
 * REVOKE half is a separate migration, see prisma/migrations/*_audit_log_revoke.
 */
export async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetId: string;
  sourceIp: string;
}): Promise<void> {
  await prisma.auditLog.create({ data: params });
}

export function sourceIpFromRequest(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
