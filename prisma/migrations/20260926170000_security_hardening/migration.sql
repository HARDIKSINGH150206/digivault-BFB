-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('PENDING', 'ANCHORED', 'FAILED');

-- AlterTable
ALTER TABLE "AnchorLog" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" "AnchorStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "targetMeta" JSONB,
ADD COLUMN     "targetType" TEXT;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "isRedacted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "serviceNumber" TEXT;

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "User_serviceNumber_key" ON "User"("serviceNumber");

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: anchors that already have a Polygon tx are ANCHORED, not PENDING.
UPDATE "AnchorLog" SET "status" = 'ANCHORED' WHERE "polygonTxHash" IS NOT NULL;

-- Backfill: versions produced by the confirm-redactions route are redacted.
-- AuditLog is the only record of which versions those were.
UPDATE "DocumentVersion" SET "isRedacted" = true
WHERE "id" IN (SELECT "targetId" FROM "AuditLog" WHERE "action" = 'CONFIRM_REDACTIONS');

-- New tables inherit digivault_app grants via ALTER DEFAULT PRIVILEGES in
-- 20260915165833_audit_log_insert_only; the AuditLog REVOKE is unaffected
-- by ADD COLUMN.
