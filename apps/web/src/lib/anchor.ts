import type { AnchorLog } from "@prisma/client";
import { prisma } from "./prisma";
import { putObjectLocked } from "./storage";
import { anchorRootOnChain } from "./polygon";
import { writeAuditLog } from "./audit";

export type AnchorResult =
  | { status: "ANCHORED"; anchorLog: AnchorLog }
  | { status: "FAILED"; anchorLog: AnchorLog | null; error: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Dual anchor for one document version (CLAUDE.md rule 3): the merkle root
 * goes to MinIO first, then to EvidenceAnchor on Polygon Amoy. Each attempt
 * is its own AnchorLog row (PENDING -> ANCHORED | FAILED), so retries keep
 * the history of earlier failures.
 *
 * Never throws — callers (upload, confirm redactions) must not fail
 * because anchoring did. Failures are recorded on the AnchorLog row and
 * audited as ANCHOR_FAILED with the error in targetMeta.
 */
export async function anchorVersion(versionId: string, actorId: string, sourceIp: string): Promise<AnchorResult> {
  let anchorLog: AnchorLog | null = null;
  let stage: "lookup" | "minio" | "polygon" = "lookup";
  try {
    const version = await prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new Error(`Document version ${versionId} not found.`);

    // The contract refuses to overwrite a root, so a second anchor of an
    // already-anchored version would only burn gas and fail.
    const existing = await prisma.anchorLog.findFirst({
      where: { documentVersionId: versionId, status: "ANCHORED" },
      orderBy: { anchoredAt: "desc" },
    });
    if (existing) return { status: "ANCHORED", anchorLog: existing };

    stage = "minio";
    const objectLockUri = await putObjectLocked(
      `${version.documentId}/v${version.versionNo}/merkle-root.json`,
      Buffer.from(JSON.stringify({ merkle_root: version.merkleRoot, version_no: version.versionNo }))
    );

    anchorLog = await prisma.anchorLog.create({
      data: {
        documentVersionId: version.id,
        chainRootHash: version.merkleRoot,
        objectLockUri,
        polygonTxHash: null,
        status: "PENDING",
      },
    });
    await writeAuditLog({
      actorId,
      action: "ANCHOR_INITIATED",
      targetId: anchorLog.id,
      targetType: "AnchorLog",
      targetMeta: { documentVersionId: version.id },
      sourceIp,
    });

    stage = "polygon";
    const { txHash } = await anchorRootOnChain(version.id, version.merkleRoot);
    anchorLog = await prisma.anchorLog.update({
      where: { id: anchorLog.id },
      data: { polygonTxHash: txHash, status: "ANCHORED" },
    });
    await writeAuditLog({
      actorId,
      action: "ANCHOR_COMPLETE",
      targetId: anchorLog.id,
      targetType: "AnchorLog",
      targetMeta: { documentVersionId: version.id, polygonTxHash: txHash },
      sourceIp,
    });
    return { status: "ANCHORED", anchorLog };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[anchor] ${stage} stage failed for version ${versionId}:`, err);

    try {
      anchorLog = anchorLog
        ? await prisma.anchorLog.update({ where: { id: anchorLog.id }, data: { status: "FAILED", errorMessage: message } })
        : stage === "lookup"
          ? null
          : await prisma.anchorLog.create({
              // MinIO half failed before a row existed; record the attempt anyway.
              data: {
                documentVersionId: versionId,
                chainRootHash: "",
                objectLockUri: "",
                status: "FAILED",
                errorMessage: message,
              },
            });
    } catch (dbErr) {
      console.error(`[anchor] could not record failure for version ${versionId}:`, dbErr);
    }

    await writeAuditLog({
      actorId,
      action: "ANCHOR_FAILED",
      targetId: anchorLog?.id ?? versionId,
      targetType: anchorLog ? "AnchorLog" : "DocumentVersion",
      targetMeta: { documentVersionId: versionId, stage, error: message.slice(0, 1000) },
      sourceIp,
    });
    return { status: "FAILED", anchorLog, error: message };
  }
}

/**
 * Starts anchorVersion without awaiting it, so upload/confirm respond as
 * soon as the version is stored; the UI polls the AnchorLog status.
 * Single long-running Node server only — a serverless deployment would
 * need a job queue here instead.
 */
export function anchorVersionInBackground(versionId: string, actorId: string, sourceIp: string): void {
  void anchorVersion(versionId, actorId, sourceIp).catch((err) =>
    console.error(`[anchor] unexpected error for version ${versionId}:`, err)
  );
}
