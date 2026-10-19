import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getAuditStatus } from "@/lib/audit-anchor";

export const runtime = "nodejs";

/**
 * GET /api/v1/admin/audit (ADMIN) — docs/07 Phase 4. Verifies the whole
 * audit hash chain and compares it with the head anchored on
 * EvidenceAnchorV2: "verified up to entry #N, anchored in block X".
 */
export async function GET(req: Request): Promise<Response> {
  try {
    requireRole(req, [Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const s = await getAuditStatus();
  return Response.json({
    chain: s.chain.ok
      ? { ok: true, checked: s.chain.checked, head_seq: s.chain.headSeq, head_hash: s.chain.headHash }
      : { ok: false, checked: s.chain.checked, bad_seq: s.chain.badSeq, reason: s.chain.reason },
    anchored: s.anchored && {
      seq: s.anchored.seq,
      head: s.anchored.head,
      anchored_at: s.anchored.anchoredAt,
      tx_hash: s.anchored.txHash,
      block_number: s.anchored.blockNumber,
    },
    anchored_matches: s.anchoredMatches,
    unanchored_entries: s.unanchoredEntries,
    rewritten_range: s.rewrittenRange,
    chain_read_error: s.chainReadError,
    interval_hours: s.intervalHours,
    recent_attempts: s.recentAttempts.map((a) => ({
      seq: a.seq,
      status: a.status,
      created_at: a.createdAt.toISOString(),
      tx_hash: a.polygonTxHash ?? a.submittedTxHash,
      block_number: a.blockNumber,
      error_message: a.errorMessage,
    })),
  });
}
