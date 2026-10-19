-- AlterTable
ALTER TABLE "AnchorLog" ADD COLUMN     "auditSeq" INTEGER,
ADD COLUMN     "contractAddress" TEXT;


-- Every attempt that reached the chain before this migration went to the
-- v1 contract (packages/contracts/deployments/amoy.json).
UPDATE "AnchorLog"
SET "contractAddress" = '0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b'
WHERE "polygonTxHash" IS NOT NULL OR "submittedTxHash" IS NOT NULL;
