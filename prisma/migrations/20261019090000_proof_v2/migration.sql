-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "commitment" TEXT,
ADD COLUMN     "proofVersion" INTEGER NOT NULL DEFAULT 1;


-- A v2 version is only meaningful with its anchored commitment. Existing
-- rows are all v1 (the default), so this holds for them.
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_v2_has_commitment"
  CHECK ("proofVersion" = 1 OR ("proofVersion" = 2 AND "commitment" IS NOT NULL));
