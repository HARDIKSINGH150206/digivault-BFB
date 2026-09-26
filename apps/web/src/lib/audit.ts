import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { clientIp } from "./request-ip";

/**
 * Every action string AuditLog may contain. AuditLog.action stays a plain
 * String column (converting it to a Postgres enum would mean rewriting
 * existing insert-only rows); this union is the type-level enum instead.
 */
export type AuditAction =
  | "CREATE_CASE"
  | "UPLOAD_DOCUMENT_VERSION"
  | "CONFIRM_REDACTIONS"
  | "CONFIRM_REDACTIONS_DETAIL"
  | "ANCHOR_INITIATED"
  | "ANCHOR_COMPLETE"
  | "ANCHOR_FAILED"
  | "GENERATE_CERTIFICATE"
  | "DOWNLOAD_CERTIFICATE"
  | "VIEW_DOCUMENT_VERSION"
  | "DOWNLOAD_PAGE"
  | "DOWNLOAD_PROOF"
  | "SHARE_CREATED"
  | "SHARE_REVOKED"
  | "SHARE_LINK_ACCESSED"
  | "SHARE_LINK_DOWNLOADED"
  | "WEBAUTHN_REGISTERED";

export type AuditTargetType = "User" | "Case" | "DocumentVersion" | "AnchorLog" | "DocumentShare";

/**
 * The ONLY way any route writes to AuditLog — a bare `prisma.auditLog.create`.
 * There is deliberately no updateAuditLog/deleteAuditLog export here, and no
 * API route anywhere exposes update/delete for this model. This is the
 * application-layer half of "insert-only"; the DB-level REVOKE half is
 * prisma/migrations/20260915165833_audit_log_insert_only.
 *
 * Never throws: a failed audit write is logged to console.error but must
 * not block the operation being audited.
 */
export async function writeAuditLog(params: {
  actorId: string;
  action: AuditAction;
  targetId: string;
  targetType?: AuditTargetType;
  targetMeta?: Prisma.InputJsonValue;
  sourceIp: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({ data: params });
  } catch (err) {
    console.error(`[audit] failed to write ${params.action} for ${params.targetId}:`, err);
  }
}

/** See lib/request-ip.ts for how X-Forwarded-For is (and isn't) trusted. */
export function sourceIpFromRequest(req: Request): string {
  return clientIp(req);
}
