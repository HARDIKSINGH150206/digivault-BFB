-- CreateTable
CREATE TABLE "VersionSaltSet" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "tileCount" INTEGER NOT NULL,
    "keyId" TEXT NOT NULL,
    "iv" BYTEA NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionSaltSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersionSaltSet_documentVersionId_key" ON "VersionSaltSet"("documentVersionId");

-- AddForeignKey
ALTER TABLE "VersionSaltSet" ADD CONSTRAINT "VersionSaltSet_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Salts are write-once evidence (ADR-018): the app role may insert and
-- read them, never change or remove them. Same pattern as AuditLog in
-- 20260915165833_audit_log_insert_only.
REVOKE UPDATE, DELETE ON "VersionSaltSet" FROM digivault_app;
