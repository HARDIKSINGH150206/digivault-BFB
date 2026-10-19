import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { requireStepUp } from "@/lib/step-up";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { anchoredValue } from "@/lib/proof-v2";
import { buildCertificatePdf } from "@/lib/certificate";
import { publicVerifyUrl } from "@/lib/public-proof";
import { defaultChainConfig, getTxBlock, legacyChainConfig, type ChainConfig } from "@/lib/polygon";

export const runtime = "nodejs";

const ALL_ROLES = [
  Role.POLICE_OFFICER,
  Role.INVESTIGATING_OFFICER,
  Role.COURT_OFFICIAL,
  Role.FORENSIC_LAB,
  Role.ADMIN,
];

/** The trusted contract (v2, or legacy v1) the anchor was written to. */
function chainConfigFor(contractAddress: string | null): ChainConfig | null {
  if (!contractAddress) return null;
  const configs = [defaultChainConfig()];
  try {
    configs.push(legacyChainConfig());
  } catch {
    // No v1 deployment record.
  }
  return configs.find((c) => c.contractAddress.toLowerCase() === contractAddress.toLowerCase()) ?? null;
}

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}/certificate
 *
 * BSA s.63 certificate (docs/04 §5, docs/07 Phase 5; lib/certificate.ts).
 * docs/01: software cannot self-certify evidence, so this is only ever a
 * PRE-FILLED, unsigned certificate with blank signature blocks for the
 * officer and the expert. Once the version is anchored it carries a QR to
 * the chain-only check on /verify (ADR-022).
 */
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
    requireStepUp(req, actor);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({
    where: { id: params.versionId },
    include: { document: { include: { case: true } } },
  });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  // Only a confirmed anchor goes on the certificate: a later FAILED or
  // PENDING attempt must not hide it, and must not stand in for it.
  const anchor = await prisma.anchorLog.findFirst({
    where: { documentVersionId: version.id, status: "ANCHORED", polygonTxHash: { not: null } },
    orderBy: { anchoredAt: "desc" },
  });
  const txHash = anchor?.polygonTxHash ?? null;

  let block: { number: number; time: Date } | null = null;
  if (anchor && txHash) {
    try {
      const config = chainConfigFor(anchor.contractAddress);
      const b = config ? await getTxBlock(txHash, config) : null;
      if (b) block = { number: b.blockNumber, time: new Date(b.timestamp * 1000) };
    } catch (err) {
      // The certificate still lists the tx; anyone can look the block up.
      console.warn(`[certificate] block for ${txHash} not read:`, err instanceof Error ? err.message : err);
    }
  }

  const bytes = await buildCertificatePdf({
    caseNumber: version.document.case.caseNumber,
    documentTitle: version.document.title,
    versionNo: version.versionNo,
    proofVersion: version.proofVersion,
    gridSize: version.gridSize,
    anchoredValue: anchoredValue(version),
    documentRoot: version.merkleRoot,
    fileHash: version.clientHash,
    chainHash: version.chainHash,
    previousHash: version.previousHash,
    anchor:
      anchor && txHash
        ? {
            txHash,
            contractAddress: anchor.contractAddress ?? "",
            objectLockUri: anchor.objectLockUri,
            block,
            recordedAt: anchor.anchoredAt,
          }
        : null,
    verifyUrl: txHash ? publicVerifyUrl({ documentVersionId: version.id, commitment: anchoredValue(version), txHash }) : null,
    generatedAt: new Date(),
    generatedForRole: actor.role,
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "DOWNLOAD_CERTIFICATE",
    targetId: version.id,
    targetType: "DocumentVersion",
    targetMeta: { versionNo: version.versionNo, anchored: Boolean(txHash), blockRead: Boolean(block) },
    sourceIp: sourceIpFromRequest(req),
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bsa-certificate-${version.document.title.replace(/[^a-z0-9]+/gi, "-")}-v${version.versionNo}.pdf"`,
    },
  });
}
