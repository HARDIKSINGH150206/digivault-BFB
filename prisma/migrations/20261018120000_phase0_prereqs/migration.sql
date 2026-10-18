-- AlterTable
ALTER TABLE "AnchorLog" ADD COLUMN     "submittedTxHash" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "entryHash" TEXT,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "seq" INTEGER;

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "firRegisteredAt" TIMESTAMP(3),
ADD COLUMN     "offenceSections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tile" ADD COLUMN     "documentVersionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Tile_documentVersionId_tileIndex_key" ON "Tile"("documentVersionId", "tileIndex");

-- AddForeignKey
ALTER TABLE "Tile" ADD CONSTRAINT "Tile_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (ADR-024): until now Tile rows were replaced wholesale on every
-- new version, so the rows that exist belong to each document's current
-- version. Older versions have no rows; lib/tiles-repo.ts recomputes them
-- from the page PNGs in MinIO on first use (checked against the stored
-- merkleRoot before they're written).
UPDATE "Tile" t
SET "documentVersionId" = d."currentVersionId"
FROM "Document" d
WHERE t."documentId" = d."id" AND d."currentVersionId" IS NOT NULL;

-- AuditLog: existing rows stay unchained (seq NULL). The chain starts with
-- the first row written after this migration. The 20260915165833 REVOKE of
-- UPDATE/DELETE for digivault_app is unaffected by ADD COLUMN.
