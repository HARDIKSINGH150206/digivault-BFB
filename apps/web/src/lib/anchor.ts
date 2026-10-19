import type { AnchorLog, DocumentVersion } from "@prisma/client";
import { prisma } from "./prisma";
import { putObjectLocked, putPublicProof } from "./storage";
import { buildPublicProof } from "./public-proof";
import { anchoredValue } from "./proof-v2";
import { getAnchorTargetDeployment } from "./contract-address";
import { getVersionPageIndices } from "./tiles-repo";
import { anchorOnChain, defaultChainConfig, getOnChainAnchor, getTxOutcome, legacyChainConfig, type AuditHead, type ChainConfig } from "./polygon";
import { writeAuditLog } from "./audit";

export type AnchorResult =
  | { status: "ANCHORED"; anchorLog: AnchorLog }
  | { status: "FAILED"; anchorLog: AnchorLog | null; error: string };

/**
 * On-chain sends are serialized: every anchor is signed by the same
 * deployer wallet, and overlapping sends would fetch the same pending
 * nonce, so all but one would be rejected. On globalThis so all route
 * bundles share one queue. Audit-head anchors (lib/audit-anchor.ts) use it too.
 */
const globalForAnchor = globalThis as unknown as { __digivaultAnchorQueue?: Promise<unknown> };

export function onChainSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalForAnchor.__digivaultAnchorQueue ?? Promise.resolve()).then(fn, fn);
  globalForAnchor.__digivaultAnchorQueue = run.catch(() => undefined);
  return run;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * ADR-022: once a SALTED (v2+) version is anchored, publish its
 * redaction-safe public proof. v1 versions are legacy (ADR-021) and get no
 * new public proof. Never throws — publication is a convenience on top of
 * the anchor, not part of it.
 */
async function publishPublicProofIfSalted(version: DocumentVersion, anchorLog: AnchorLog): Promise<void> {
  try {
    const salted = await prisma.versionSaltSet.findUnique({ where: { documentVersionId: version.id }, select: { id: true } });
    if (!salted || !anchorLog.polygonTxHash) return;
    const { chainId } = getAnchorTargetDeployment();
    const address = anchorLog.contractAddress ?? getAnchorTargetDeployment().address;
    const pageCount = (await getVersionPageIndices(version)).length;
    await putPublicProof(
      version.id,
      buildPublicProof({
        proofVersion: version.proofVersion,
        documentVersionId: version.id,
        commitment: anchoredValue(version),
        gridSize: version.gridSize,
        pageCount,
        isRedacted: version.isRedacted,
        anchor: { chainId, contractAddress: address, txHash: anchorLog.polygonTxHash, anchoredAt: anchorLog.anchoredAt },
      })
    );
  } catch (err) {
    console.error(`[anchor] public proof not published for ${version.id}:`, errorMessage(err));
  }
}

/**
 * docs/07 P0.8: an earlier attempt may have landed on-chain without this
 * server seeing the receipt (RPC error, confirm timeout). The contracts
 * refuse a second anchor, so check before spending gas on a certain revert.
 * Both contracts are checked (ADR-028): an attempt sent before contract v2
 * may have landed on v1. Returns null when the version is on neither (or a
 * read failed — then the normal send path runs, as before). Throws if a
 * contract holds a DIFFERENT value for this version, or the matching tx
 * can't be identified.
 */
async function reconcileOnChainAnchor(
  version: DocumentVersion,
  actorId: string,
  sourceIp: string
): Promise<AnchorResult | null> {
  const targets: ChainConfig[] = [defaultChainConfig()];
  try {
    targets.push(legacyChainConfig());
  } catch {
    // No v1 deployment record: nothing legacy to reconcile against.
  }

  for (const config of targets) {
    let onChain;
    try {
      onChain = await getOnChainAnchor(version.id, config);
    } catch (err) {
      console.warn(`[anchor] pre-send getAnchor on ${config.contractAddress} failed for ${version.id}, sending anyway:`, errorMessage(err));
      return null;
    }
    if (onChain.timestamp === 0) continue;

    if (onChain.merkleRoot.toLowerCase() !== `0x${anchoredValue(version)}`.toLowerCase()) {
      throw new Error(
        `On-chain anchor for version ${version.id} on ${config.contractAddress} holds a different value (${onChain.merkleRoot}); refusing to re-anchor.`
      );
    }

    const attempts = await prisma.anchorLog.findMany({
      where: { documentVersionId: version.id, submittedTxHash: { not: null } },
      orderBy: { anchoredAt: "desc" },
    });
    for (const attempt of attempts) {
      // getTxOutcome also checks the tx was sent to this contract.
      if ((await getTxOutcome(attempt.submittedTxHash!, config)) !== "success") continue;
      const anchorLog = await prisma.anchorLog.create({
        data: {
          documentVersionId: version.id,
          chainRootHash: anchoredValue(version),
          objectLockUri: attempt.objectLockUri,
          polygonTxHash: attempt.submittedTxHash,
          submittedTxHash: attempt.submittedTxHash,
          contractAddress: config.contractAddress,
          auditSeq: attempt.auditSeq,
          status: "ANCHORED",
        },
      });
      await writeAuditLog({
        actorId,
        action: "ANCHOR_COMPLETE",
        targetId: anchorLog.id,
        targetType: "AnchorLog",
        targetMeta: {
          documentVersionId: version.id,
          polygonTxHash: attempt.submittedTxHash,
          contractAddress: config.contractAddress,
          reconciledFrom: attempt.id,
        },
        sourceIp,
      });
      await publishPublicProofIfSalted(version, anchorLog);
      return { status: "ANCHORED", anchorLog };
    }

    throw new Error(
      `Version ${version.id} is already anchored on ${config.contractAddress} (${new Date(onChain.timestamp * 1000).toISOString()}) ` +
        "with the matching value, but no recorded transaction hash confirms it."
    );
  }
  return null;
}

/** The newest chained audit entry, carried by the anchor tx (ADR-019/020; docs/07 Phase 4). */
export async function currentAuditHead(): Promise<AuditHead | null> {
  const last = await prisma.auditLog.findFirst({
    where: { seq: { not: null } },
    orderBy: { seq: "desc" },
    select: { seq: true, entryHash: true },
  });
  return last?.seq && last.entryHash ? { seq: last.seq, head: last.entryHash } : null;
}

/**
 * Dual anchor for one document version (CLAUDE.md rule 3): the anchored
 * value (lib/proof-v2.ts anchoredValue: C for v2, the merkle root for
 * legacy v1) goes to MinIO first, then to EvidenceAnchor on Polygon Amoy. Each attempt
 * is its own AnchorLog row (PENDING -> ANCHORED | FAILED), so retries keep
 * the history of earlier failures.
 *
 * Never throws — callers (upload, confirm redactions) must not fail
 * because anchoring did. Failures are recorded on the AnchorLog row and
 * audited as ANCHOR_FAILED with the error in targetMeta.
 */
export async function anchorVersion(versionId: string, actorId: string, sourceIp: string): Promise<AnchorResult> {
  let anchorLog: AnchorLog | null = null;
  let stage: "lookup" | "reconcile" | "minio" | "polygon" = "lookup";
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

    stage = "reconcile";
    const reconciled = await reconcileOnChainAnchor(version, actorId, sourceIp);
    if (reconciled) return reconciled;

    stage = "minio";
    // v1 keeps its original record shape; v2 records the anchored
    // commitment and everything it commits to (docs/03 §v2).
    const record =
      version.proofVersion === 1
        ? { merkle_root: version.merkleRoot, version_no: version.versionNo }
        : {
            proof_version: version.proofVersion,
            commitment: anchoredValue(version),
            document_root: version.merkleRoot,
            client_hash: version.clientHash,
            chain_hash: version.chainHash,
            version_no: version.versionNo,
          };
    const objectLockUri = await putObjectLocked(
      `${version.documentId}/v${version.versionNo}/merkle-root.json`,
      Buffer.from(JSON.stringify(record))
    );

    const target = defaultChainConfig();
    anchorLog = await prisma.anchorLog.create({
      data: {
        documentVersionId: version.id,
        chainRootHash: anchoredValue(version),
        objectLockUri,
        polygonTxHash: null,
        contractAddress: target.contractAddress,
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
    const pendingLogId = anchorLog.id;
    // The audit head is read inside the queue, right before sending, so
    // heads go out in rising seq order.
    const { txHash, auditSeq } = await onChainSerialized(async () =>
      anchorOnChain(
        version.id,
        anchoredValue(version),
        await currentAuditHead(),
        async (submitted) => {
          await prisma.anchorLog.update({ where: { id: pendingLogId }, data: { submittedTxHash: submitted } });
        },
        target
      )
    );
    anchorLog = await prisma.anchorLog.update({
      where: { id: anchorLog.id },
      data: { polygonTxHash: txHash, auditSeq, status: "ANCHORED" },
    });
    await writeAuditLog({
      actorId,
      action: "ANCHOR_COMPLETE",
      targetId: anchorLog.id,
      targetType: "AnchorLog",
      targetMeta: { documentVersionId: version.id, polygonTxHash: txHash, contractAddress: target.contractAddress, auditSeq },
      sourceIp,
    });
    await publishPublicProofIfSalted(version, anchorLog);
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
