import type { DocumentVersion, Tile } from "@prisma/client";
import type { TileHash } from "@digivault/crypto-core";
import { prisma } from "./prisma";
import { getPagePng, listPageIndices } from "./storage";
import { recomputeDocumentHashesV1 } from "./server-hash";

/**
 * Tile rows are per DocumentVersion (ADR-024): a new version adds its own
 * rows and never deletes an earlier version's, so every version keeps its
 * tile-level hash breakdown and its RedactionFlags.
 *
 * Before ADR-024, rows were replaced wholesale on each new version, so
 * superseded versions from that era have no rows. getVersionTiles()
 * rebuilds them from the version's page PNGs in MinIO — the same server
 * recomputation the upload route does — and only stores them if the
 * recomputed root equals the version's stored merkleRoot. That only
 * applies to legacy v1 versions: v2 versions always get their rows at
 * creation, and their leaves need the version's salts.
 */
export async function createVersionTiles(documentId: string, documentVersionId: string, tiles: TileHash[]): Promise<void> {
  await prisma.tile.createMany({
    data: tiles.map((t) => ({
      documentId,
      documentVersionId,
      tileIndex: t.index,
      pageIndex: t.pageIndex,
      row: t.row,
      col: t.col,
      tileHash: t.hashHex,
      merkleLeafIndex: t.index,
    })),
    // Two concurrent backfills of the same legacy version write identical rows.
    skipDuplicates: true,
  });
}

export class TileBackfillError extends Error {}

/** All tiles of one version, ordered by tileIndex; rebuilt from MinIO for legacy versions (see above). */
export async function getVersionTiles(
  version: Pick<DocumentVersion, "id" | "documentId" | "versionNo" | "gridSize" | "merkleRoot" | "proofVersion">
): Promise<Tile[]> {
  const existing = await prisma.tile.findMany({
    where: { documentVersionId: version.id },
    orderBy: { tileIndex: "asc" },
  });
  if (existing.length > 0) return existing;
  if (version.proofVersion !== 1) {
    throw new TileBackfillError(`Version ${version.id}: v${version.proofVersion} version has no tile rows.`);
  }

  const pageIndices = await listPageIndices(`${version.documentId}/v${version.versionNo}`);
  if (pageIndices.length === 0 || pageIndices.some((p, i) => p !== i)) {
    throw new TileBackfillError(`Version ${version.id}: page images missing or non-contiguous in storage.`);
  }
  const pages = await Promise.all(
    pageIndices.map((i) => getPagePng(`${version.documentId}/v${version.versionNo}/page-${i}.png`))
  );
  const recomputed = await recomputeDocumentHashesV1(pages, version.gridSize);
  if (recomputed.merkleRoot !== version.merkleRoot) {
    throw new TileBackfillError(
      `Version ${version.id}: stored pages no longer match the recorded merkle root — not backfilling tiles.`
    );
  }
  await createVersionTiles(version.documentId, version.id, recomputed.tiles);
  return prisma.tile.findMany({ where: { documentVersionId: version.id }, orderBy: { tileIndex: "asc" } });
}

/** Distinct page indices of one version, ascending. */
export async function getVersionPageIndices(
  version: Pick<DocumentVersion, "id" | "documentId" | "versionNo" | "gridSize" | "merkleRoot" | "proofVersion">
): Promise<number[]> {
  const tiles = await getVersionTiles(version);
  return [...new Set(tiles.map((t) => t.pageIndex))].sort((a, b) => a - b);
}
