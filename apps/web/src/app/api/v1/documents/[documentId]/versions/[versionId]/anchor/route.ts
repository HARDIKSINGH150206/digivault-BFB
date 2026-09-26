import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { putObjectLocked } from "@/lib/storage";
import { anchorRootOnChain } from "@/lib/polygon";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * docs/04-api-spec.md endpoint 4 documents this as async + poll, because a
 * Polygon tx shouldn't block an HTTP request. There's no job queue in this
 * codebase yet, though (no Redis/BullMQ), so POST below actually runs
 * start-to-finish synchronously — MinIO write, then the on-chain call — and
 * GET just re-reads whatever AnchorLog row that left behind. Flagging this
 * as a real gap against the documented contract, not pretending it's
 * fire-and-forget: see the audit report.
 */

// POST /api/v1/documents/{documentId}/versions/{versionId}/anchor
export async function POST(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const objectLockUri = await putObjectLocked(
    `${params.documentId}/v${version.versionNo}/merkle-root.json`,
    Buffer.from(JSON.stringify({ merkle_root: version.merkleRoot, version_no: version.versionNo }))
  );

  const anchorLog = await prisma.anchorLog.create({
    data: {
      documentVersionId: version.id,
      chainRootHash: version.merkleRoot,
      objectLockUri,
      polygonTxHash: null,
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "ANCHOR_INITIATED",
    targetId: anchorLog.id,
    sourceIp: sourceIpFromRequest(req),
  });

  try {
    const { txHash } = await anchorRootOnChain(version.id, version.merkleRoot);
    const updated = await prisma.anchorLog.update({
      where: { id: anchorLog.id },
      data: { polygonTxHash: txHash },
    });

    await writeAuditLog({
      actorId: actor.userId,
      action: "ANCHOR_COMPLETE",
      targetId: updated.id,
      sourceIp: sourceIpFromRequest(req),
    });

    return Response.json(
      {
        anchor_log_id: updated.id,
        document_version_id: version.id,
        status: "COMPLETE",
        chain_root_hash: updated.chainRootHash,
        object_lock_uri: updated.objectLockUri,
        polygon_tx_hash: updated.polygonTxHash,
        anchored_at: updated.anchoredAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    // MinIO half already succeeded and is persisted; only the on-chain
    // half failed. Schema has no FAILED-state column (see comment above) —
    // the AnchorLog row stays with polygonTxHash: null, indistinguishable
    // from "still pending" on the next GET. Flagged as a gap, not silently patched.
    return Response.json(
      {
        anchor_log_id: anchorLog.id,
        document_version_id: version.id,
        status: "FAILED",
        reason: err instanceof Error ? err.message : String(err),
        object_lock_uri: objectLockUri,
        polygon_tx_hash: null,
      },
      { status: 502 }
    );
  }
}

// GET /api/v1/documents/{documentId}/versions/{versionId}/anchor — poll.
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  try {
    requireRole(req, [
      Role.POLICE_OFFICER,
      Role.INVESTIGATING_OFFICER,
      Role.COURT_OFFICIAL,
      Role.FORENSIC_LAB,
      Role.ADMIN,
    ]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const anchorLog = await prisma.anchorLog.findFirst({
    where: { documentVersionId: params.versionId },
    orderBy: { anchoredAt: "desc" },
  });
  if (!anchorLog) {
    return Response.json({ error: "NOT_FOUND", message: "No anchor has been triggered for this version yet." }, { status: 404 });
  }

  return Response.json({
    anchor_log_id: anchorLog.id,
    document_version_id: params.versionId,
    status: anchorLog.polygonTxHash ? "COMPLETE" : "PENDING",
    chain_root_hash: anchorLog.chainRootHash,
    object_lock_uri: anchorLog.objectLockUri,
    polygon_tx_hash: anchorLog.polygonTxHash,
    anchored_at: anchorLog.anchoredAt.toISOString(),
  });
}
