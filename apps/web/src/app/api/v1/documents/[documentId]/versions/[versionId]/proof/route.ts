import { Role } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getPagePng } from "@/lib/storage";
import { getEvidenceAnchorDeployment } from "@/lib/contract-address";
import { sha256, toHex } from "@digivault/crypto-core";

export const runtime = "nodejs";

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}/proof
 * docs/04-api-spec.md endpoint 5 — generates the verification-proof.json
 * that the standalone Court Verification Portal consumes. This route
 * itself is authenticated/backend (someone has to produce the file); the
 * portal that CONSUMES it makes zero calls back here (CLAUDE.md rule 5).
 */
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

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const anchorLog = await prisma.anchorLog.findFirst({
    where: { documentVersionId: version.id, polygonTxHash: { not: null } },
    orderBy: { anchoredAt: "desc" },
  });
  if (!anchorLog) {
    return Response.json(
      { error: "NOT_ANCHORED", message: "This version has not completed on-chain anchoring yet." },
      { status: 409 }
    );
  }

  const tiles = await prisma.tile.findMany({
    where: { documentId: params.documentId },
    orderBy: { tileIndex: "asc" },
  });

  const pageIndices = [...new Set(tiles.map((t) => t.pageIndex))].sort((a, b) => a - b);
  const pages = [];
  for (const pageIndex of pageIndices) {
    const png = await getPagePng(`${params.documentId}/v${version.versionNo}/page-${pageIndex}.png`);
    const metadata = await sharp(png).metadata();
    const pngSha256 = toHex(await sha256(png));
    pages.push({
      page_index: pageIndex,
      width_px: metadata.width,
      height_px: metadata.height,
      png_sha256: pngSha256,
    });
  }

  const { chainId, address } = getEvidenceAnchorDeployment();

  return Response.json({
    digivault_proof_version: 1,
    document_version_id: version.id,
    grid_size: version.gridSize,
    page_count: pages.length,
    merkle_root: version.merkleRoot,
    pages,
    tiles: tiles.map((t) => ({ tile_index: t.tileIndex, hash: t.tileHash })),
    anchor: {
      polygon_chain_id: chainId,
      contract_address: address,
      polygon_tx_hash: anchorLog.polygonTxHash,
      anchored_at: anchorLog.anchoredAt.toISOString(),
    },
  });
}
