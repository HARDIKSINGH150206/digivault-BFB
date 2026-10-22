-- AlterTable
ALTER TABLE "RedactionFlag" ADD COLUMN     "nameHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CaseGazetteerEntry" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "nameHash" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseGazetteerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseGazetteerEntry_caseId_keyId_nameHash_key" ON "CaseGazetteerEntry"("caseId", "keyId", "nameHash");

-- AddForeignKey
ALTER TABLE "CaseGazetteerEntry" ADD CONSTRAINT "CaseGazetteerEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Gazetteer entries are write-once (ADR-034): the app role may insert and
-- read them, never change or remove them. Same pattern as VersionSaltSet.
REVOKE UPDATE, DELETE ON "CaseGazetteerEntry" FROM digivault_app;
