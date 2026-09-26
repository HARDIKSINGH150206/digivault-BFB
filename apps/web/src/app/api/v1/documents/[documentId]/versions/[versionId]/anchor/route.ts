import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { requireStepUp } from "@/lib/step-up";
import { anchorVersion } from "@/lib/anchor";
import { sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Versions are anchored automatically after upload and after confirmed
 * redactions (lib/anchor.ts). POST here is the manual retry for a FAILED
 * (or never-started) anchor; it runs synchronously and returns the outcome.
 */

// POST /api/v1/documents/{documentId}/versions/{versionId}/anchor
export async function POST(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.INVESTIGATING_OFFICER, Role.ADMIN]);
    requireStepUp(req, actor);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const result = await anchorVersion(version.id, actor.userId, sourceIpFromRequest(req));
  const log = result.anchorLog;

  if (result.status === "ANCHORED") {
    return Response.json({
      anchor_log_id: log!.id,
      document_version_id: version.id,
      status: "ANCHORED",
      chain_root_hash: log!.chainRootHash,
      object_lock_uri: log!.objectLockUri,
      polygon_tx_hash: log!.polygonTxHash,
      anchored_at: log!.anchoredAt.toISOString(),
    });
  }

  return Response.json(
    {
      anchor_log_id: log?.id ?? null,
      document_version_id: version.id,
      status: "FAILED",
      reason: result.error,
      object_lock_uri: log?.objectLockUri || null,
      polygon_tx_hash: null,
    },
    { status: 502 }
  );
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
    status: anchorLog.status,
    error_message: anchorLog.errorMessage,
    chain_root_hash: anchorLog.chainRootHash,
    object_lock_uri: anchorLog.objectLockUri,
    polygon_tx_hash: anchorLog.polygonTxHash,
    anchored_at: anchorLog.anchoredAt.toISOString(),
  });
}
