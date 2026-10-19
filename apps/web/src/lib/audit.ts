import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { clientIp } from "./request-ip";
import { AUDIT_CHAIN_GENESIS, computeAuditEntryHash } from "./audit-chain";

/**
 * Arbitrary constant key for pg_advisory_xact_lock: serializes chained
 * audit inserts so two concurrent writers can't both claim the same
 * (seq, prevHash) and fork the chain. Released automatically at commit.
 */
const AUDIT_CHAIN_LOCK_KEY = 4471809;

/**
 * Every action string AuditLog may contain. AuditLog.action stays a plain
 * String column (converting it to a Postgres enum would mean rewriting
 * existing insert-only rows); this union is the type-level enum instead.
 */
export type AuditAction =
  | "CREATE_CASE"
  | "UPDATE_CASE_DEADLINE_FIELDS"
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
  | "DOWNLOAD_REDACTION_PROOF"
  | "SHARE_CREATED"
  | "SHARE_REVOKED"
  | "SHARE_LINK_ACCESSED"
  | "SHARE_LINK_DOWNLOADED"
  | "SHARE_LINK_PAGE_DOWNLOADED"
  | "SHARE_LINK_REDACTION_PROOF_DOWNLOADED"
  | "WEBAUTHN_REGISTERED"
  // Written once by scripts/audit-legacy-genesis.mjs (ADR-026), not by any route.
  | "AUDIT_LEGACY_GENESIS"
  | "AUDIT_HEAD_ANCHOR_REQUESTED";

export type AuditTargetType = "User" | "Case" | "DocumentVersion" | "AnchorLog" | "DocumentShare" | "AuditLog";

/**
 * The ONLY way any route writes to AuditLog.
 * There is deliberately no updateAuditLog/deleteAuditLog export here, and no
 * API route anywhere exposes update/delete for this model. This is the
 * application-layer half of "insert-only"; the DB-level REVOKE half is
 * prisma/migrations/20260915165833_audit_log_insert_only.
 *
 * Each row is hash-chained at INSERT (seq, prevHash, entryHash — see
 * lib/audit-chain.ts); the app role can't UPDATE, so the chain fields must
 * be right the first time. Verify with scripts/verify-audit-chain.mjs.
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);
      const last = await tx.auditLog.findFirst({
        where: { seq: { not: null } },
        orderBy: { seq: "desc" },
        select: { seq: true, entryHash: true },
      });
      const seq = (last?.seq ?? 0) + 1;
      const prevHash = last?.entryHash ?? AUDIT_CHAIN_GENESIS;
      const timestamp = new Date();
      const entryHash = computeAuditEntryHash({ ...params, seq, prevHash, timestamp });
      await tx.auditLog.create({ data: { ...params, seq, prevHash, entryHash, timestamp } });
    });
  } catch (err) {
    console.error(`[audit] failed to write ${params.action} for ${params.targetId}:`, err);
  }
}

/** See lib/request-ip.ts for how X-Forwarded-For is (and isn't) trusted. */
export function sourceIpFromRequest(req: Request): string {
  return clientIp(req);
}
