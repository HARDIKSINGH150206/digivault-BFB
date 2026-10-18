import { Role } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getPagePng } from "@/lib/storage";
import { getLegacyAnchorDeployment } from "@/lib/contract-address";
import { commitmentV2, documentRootV2, fileHashOfPngs, fromHex, merkleTreeHash, sha256, toHex } from "@digivault/crypto-core";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { getVersionTiles, TileBackfillError } from "@/lib/tiles-repo";
import { loadVersionSalts, revealableSalts } from "@/lib/tile-salts";
import { buildVerificationProofV2 } from "@/lib/proof-v2";

export const runtime = "nodejs";

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}/proof
 * docs/04-api-spec.md endpoint 5 — generates the verification-proof.json
 * that the standalone Court Verification Portal consumes. This route
 * itself is authenticated/backend (someone has to produce the file); the
 * portal that CONSUMES it makes zero calls back here (CLAUDE.md rule 5).
 *
 * v2 versions get digivault_proof_version 2 (salted leaves, docs/03 §v2);
 * legacy v1 versions keep the v1 format, which /verify checks read-only
 * (ADR-021). Before a v2 proof is served, the stored leaves, salts' count,
 * page PNGs and recorded R/C are checked against each other, so a proof
 * is never built from rows or pages that drifted after anchoring.
 */
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [
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

  // This version's own tiles — before ADR-024 this read the document's
  // current tiles, which was wrong for any superseded version.
  let tiles;
  try {
    tiles = await getVersionTiles(version);
  } catch (err) {
    if (err instanceof TileBackfillError) {
      return Response.json({ error: "INTEGRITY_ERROR", message: err.message }, { status: 409 });
    }
    throw err;
  }

  const pageIndices = [...new Set(tiles.map((t) => t.pageIndex))].sort((a, b) => a - b);
  const pages = [];
  const pngs: Buffer[] = [];
  for (const pageIndex of pageIndices) {
    const png = await getPagePng(`${params.documentId}/v${version.versionNo}/page-${pageIndex}.png`);
    pngs.push(png);
    const metadata = await sharp(png).metadata();
    const pngSha256 = toHex(await sha256(png));
    pages.push({
      page_index: pageIndex,
      width_px: metadata.width,
      height_px: metadata.height,
      png_sha256: pngSha256,
    });
  }

  // The contract this version's anchor actually lives on (ADR-028): v2 for
  // new anchors, v1 for those written before contract v2.
  const { chainId, address: legacyAddress } = getLegacyAnchorDeployment();
  const address = anchorLog.contractAddress ?? legacyAddress;

  let proofV2: ReturnType<typeof buildVerificationProofV2> | null = null;
  if (version.proofVersion !== 1) {
    const integrityError = (message: string) =>
      Response.json({ error: "INTEGRITY_ERROR", message: `Version ${version.id}: ${message}` }, { status: 409 });
    const salts = await loadVersionSalts(version.id);
    if (!salts || salts.length !== tiles.length) return integrityError("salt set missing or the wrong size.");
    const perPage = version.gridSize * version.gridSize;
    if (tiles.length !== pageIndices.length * perPage || pageIndices.some((p, i) => p !== i)) {
      return integrityError("tile rows do not cover every page.");
    }
    const pageRoots = pageIndices.map((p) =>
      merkleTreeHash(tiles.slice(p * perPage, (p + 1) * perPage).map((t) => fromHex(t.tileHash, 32)))
    );
    const documentRoot = toHex(documentRootV2(pageRoots));
    const fileHash = toHex(await fileHashOfPngs(pngs.map((b) => new Uint8Array(b))));
    if (documentRoot !== version.merkleRoot) return integrityError("stored tile leaves do not rebuild the recorded document root.");
    if (fileHash !== version.clientHash) return integrityError("stored page images do not match the recorded client hash.");
    if (toHex(commitmentV2(fromHex(fileHash), fromHex(documentRoot))) !== version.commitment) {
      return integrityError("recorded commitment does not match its inputs.");
    }
    proofV2 = buildVerificationProofV2({
      documentVersionId: version.id,
      isRedacted: version.isRedacted,
      gridSize: version.gridSize,
      fileHash,
      documentRoot,
      commitment: version.commitment!,
      pages: pages.map((p, i) => ({
        pageIndex: p.page_index,
        widthPx: p.width_px ?? 0,
        heightPx: p.height_px ?? 0,
        pngSha256: p.png_sha256,
        pageRoot: toHex(pageRoots[i]),
      })),
      tiles: tiles.map((t) => ({ tileIndex: t.tileIndex, leaf: t.tileHash })),
      // This version's own salts, all of them: whoever receives this proof
      // receives these pages. For a redacted version these are its own
      // fresh salts — the masked tiles' ORIGINAL salts belong to the prior
      // version and are never in here (ADR-018).
      salts: revealableSalts(salts, []),
      anchor: { chainId, contractAddress: address, txHash: anchorLog.polygonTxHash!, anchoredAt: anchorLog.anchoredAt },
    });
  }

  await writeAuditLog({
    actorId: actor.userId,
    action: "DOWNLOAD_PROOF",
    targetId: version.id,
    targetType: "DocumentVersion",
    targetMeta: { versionNo: version.versionNo, anchorLogId: anchorLog.id, pageCount: pages.length, proofVersion: version.proofVersion },
    sourceIp: sourceIpFromRequest(req),
  });

  if (proofV2) return Response.json(proofV2);

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
