import type { TileHash } from "@digivault/crypto-core";
import { prisma } from "./prisma";

/**
 * `Tile` in prisma/schema.prisma has no documentVersionId FK — it only
 * belongs to `Document`, not to a specific `DocumentVersion`. That means
 * this schema can only represent ONE set of tiles per document at a time
 * (the current/latest version's), not full per-version tile history.
 * Flagging this rather than silently working around it: every time a new
 * version is created (initial upload or a redaction confirm), this
 * replaces the document's Tile rows wholesale rather than versioning them.
 * A document version's `merkleRoot`/`clientHash` on `DocumentVersion`
 * still capture that version's cryptographic identity permanently — it's
 * only the granular per-tile hash breakdown for OLDER versions that isn't
 * retained. Worth a schema follow-up (add `Tile.documentVersionId`) if
 * per-version tile-level history turns out to matter later.
 */
export async function replaceDocumentTiles(documentId: string, tiles: TileHash[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.tile.findMany({ where: { documentId }, select: { id: true } });
    const existingIds = existing.map((t) => t.id);

    if (existingIds.length > 0) {
      await tx.redactionFlag.deleteMany({ where: { tileId: { in: existingIds } } });
      await tx.tile.deleteMany({ where: { id: { in: existingIds } } });
    }

    await tx.tile.createMany({
      data: tiles.map((t) => ({
        documentId,
        tileIndex: t.index,
        pageIndex: t.pageIndex,
        row: t.row,
        col: t.col,
        tileHash: t.hashHex,
        merkleLeafIndex: t.index,
      })),
    });
  });
}
