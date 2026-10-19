-- CreateTable
CREATE TABLE "AuditHeadAnchor" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectLockUri" TEXT,
    "submittedTxHash" TEXT,
    "polygonTxHash" TEXT,
    "blockNumber" INTEGER,
    "contractAddress" TEXT,
    "status" "AnchorStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,

    CONSTRAINT "AuditHeadAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditHeadAnchor_seq_idx" ON "AuditHeadAnchor"("seq");


-- Attempts are history (like AnchorLog): the app role updates a row's
-- status as the tx progresses, but never removes one.
REVOKE DELETE ON "AuditHeadAnchor" FROM digivault_app;
