import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { requireStepUp } from "@/lib/step-up";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { anchorAuditHead } from "@/lib/audit-anchor";

export const runtime = "nodejs";

/**
 * POST /api/v1/admin/audit/anchor (ADMIN, step-up) — anchors the audit head
 * now instead of waiting for the schedule (docs/07 Phase 4). The request is
 * audited first, so the head anchored includes it. Spends gas.
 */
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.ADMIN]);
    requireStepUp(req, actor);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  await writeAuditLog({
    actorId: actor.userId,
    action: "AUDIT_HEAD_ANCHOR_REQUESTED",
    targetId: "audit-log",
    targetType: "AuditLog",
    sourceIp: sourceIpFromRequest(req),
  });

  const result = await anchorAuditHead();
  if (result.status === "SKIPPED") return Response.json({ status: "SKIPPED", reason: result.reason, on_chain_seq: result.onChainSeq });
  if (result.status === "ANCHORED") {
    const r = result.record;
    return Response.json({
      status: "ANCHORED",
      seq: r.seq,
      entry_hash: r.entryHash,
      tx_hash: r.polygonTxHash,
      block_number: r.blockNumber,
      object_lock_uri: r.objectLockUri,
    });
  }
  return Response.json({ status: "FAILED", reason: result.error, seq: result.record?.seq ?? null }, { status: 502 });
}
