import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getVersionTiles } from "@/lib/tiles-repo";
import { anchoredValue } from "@/lib/proof-v2";
import { publicVerifyUrl } from "@/lib/public-proof";

export const runtime = "nodejs";

const ALL_ROLES = [
  Role.POLICE_OFFICER,
  Role.INVESTIGATING_OFFICER,
  Role.COURT_OFFICIAL,
  Role.FORENSIC_LAB,
  Role.ADMIN,
];

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}
 * Not in docs/04-api-spec.md (another gap that doc didn't need to cover —
 * it specs the write/action endpoints, not a plain read of a version's own
 * state, which the frontend needs to render a page/refresh without having
 * just come from the action that produced it).
 */
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  try {
    requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({
    where: { id: params.versionId },
    include: { document: { include: { case: true } } },
  });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const anchor = await prisma.anchorLog.findFirst({
    where: { documentVersionId: version.id },
    orderBy: { anchoredAt: "desc" },
  });

  // Per-version tiles (ADR-024). A legacy version without rows is rebuilt
  // from its stored pages; if that fails, report 0 rather than fail the read.
  let tileCount = await prisma.tile.count({ where: { documentVersionId: version.id } });
  if (tileCount === 0) {
    tileCount = await getVersionTiles(version).then(
      (tiles) => tiles.length,
      (err) => {
        console.error(`[version] tile backfill failed for ${version.id}:`, err);
        return 0;
      }
    );
  }

  return Response.json({
    document_id: version.documentId,
    document_version_id: version.id,
    document_title: version.document.title,
    case_id: version.document.caseId,
    case_number: version.document.case.caseNumber,
    version_no: version.versionNo,
    grid_size: version.gridSize,
    tile_count: tileCount,
    status: version.status,
    is_redacted: version.isRedacted,
    proof_version: version.proofVersion,
    merkle_root: version.merkleRoot,
    // The value anchored on-chain: C for v2, the merkle root for legacy v1.
    commitment: anchoredValue(version),
    client_hash: version.clientHash,
    chain_hash: version.chainHash,
    previous_hash: version.previousHash,
    storage_uri: version.storageUri,
    is_current_version: version.document.currentVersionId === version.id,
    created_at: version.timestamp.toISOString(),
    anchor: anchor
      ? {
          status: anchor.status,
          error_message: anchor.errorMessage,
          object_lock_uri: anchor.objectLockUri,
          polygon_tx_hash: anchor.polygonTxHash,
          contract_address: anchor.contractAddress,
          anchored_at: anchor.anchoredAt.toISOString(),
        }
      : null,
    // Certificate QR target (ADR-022): chain-only check on /verify, under
    // PUBLIC_BASE_URL.
    public_verify_url:
      anchor?.status === "ANCHORED" && anchor.polygonTxHash
        ? publicVerifyUrl({ documentVersionId: version.id, commitment: anchoredValue(version), txHash: anchor.polygonTxHash })
        : null,
  });
}
