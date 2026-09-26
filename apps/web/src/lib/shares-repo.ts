import { prisma } from "./prisma";
import { writeAuditLog } from "./audit";

export type ShareViewResult =
  | { status: "NOT_FOUND" }
  | { status: "REVOKED" }
  | { status: "EXPIRED" }
  | { status: "EXHAUSTED" }
  | {
      status: "OK";
      recipientLabel: string;
      expiresAt: Date;
      viewsRemaining: number;
      document: {
        id: string;
        title: string;
        docType: string;
        caseNumber: string;
        redactedVersion: SharedVersion | null;
      };
    };

/**
 * Looks up a share by token, enforces revoke/expiry/view-limit, and — only
 * on success — increments viewCount. Shared by GET /api/v1/shares/{token}
 * (the API contract) and the unauthenticated recipient page (apps/web/src/
 * app/shares/[token]/page.tsx), which renders server-side directly off
 * Prisma rather than round-tripping through its own API — so "a view" is
 * counted exactly once no matter which caller triggers it — and audited
 * once, as SHARE_LINK_ACCESSED.
 *
 * Share recipients have no DigiVault account, but AuditLog.actorId is a
 * required FK to User, so access is attributed to the officer who created
 * the share, with targetMeta.accessedBy = "share_recipient" marking that
 * the officer didn't perform it themselves.
 */
export async function resolveShareView(token: string, sourceIp: string): Promise<ShareViewResult> {
  const share = await prisma.documentShare.findUnique({
    where: { token },
    include: { document: { include: { case: true } } },
  });
  if (!share) return { status: "NOT_FOUND" };
  if (share.revokedAt) return { status: "REVOKED" };
  if (share.expiresAt < new Date()) return { status: "EXPIRED" };
  if (share.viewCount >= share.maxViews) return { status: "EXHAUSTED" };

  const updated = await prisma.documentShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  });

  const latestVersion = await getLatestRedactedVersion(share.documentId);

  await writeAuditLog({
    actorId: share.createdBy,
    action: "SHARE_LINK_ACCESSED",
    targetId: share.id,
    targetType: "DocumentShare",
    targetMeta: {
      accessedBy: "share_recipient",
      recipientLabel: share.recipientLabel,
      documentId: share.documentId,
      versionId: latestVersion?.id ?? null,
      viewNumber: updated.viewCount,
      maxViews: share.maxViews,
    },
    sourceIp,
  });

  return {
    status: "OK",
    recipientLabel: share.recipientLabel,
    expiresAt: share.expiresAt,
    viewsRemaining: share.maxViews - updated.viewCount,
    document: {
      id: share.document.id,
      title: share.document.title,
      docType: share.document.docType,
      caseNumber: share.document.case.caseNumber,
      redactedVersion: latestVersion,
    },
  };
}

export type SharedVersion = {
  id: string;
  versionNo: number;
  merkleRoot: string;
  chainHash: string;
  timestamp: Date;
  storageUri: string;
  polygonTxHash: string | null;
};

/**
 * The only version a share link may ever expose (F-03): the newest one
 * produced by confirmed redactions. The original upload is never served,
 * even if it is the only anchored version. Null means nothing is
 * shareable yet.
 */
export async function getLatestRedactedVersion(documentId: string): Promise<SharedVersion | null> {
  const version = await prisma.documentVersion.findFirst({
    where: { documentId, isRedacted: true, status: "READY" },
    orderBy: { versionNo: "desc" },
    include: { anchors: { where: { status: "ANCHORED" }, orderBy: { anchoredAt: "desc" }, take: 1 } },
  });
  if (!version) return null;
  return {
    id: version.id,
    versionNo: version.versionNo,
    merkleRoot: version.merkleRoot,
    chainHash: version.chainHash,
    timestamp: version.timestamp,
    storageUri: version.storageUri,
    polygonTxHash: version.anchors[0]?.polygonTxHash ?? null,
  };
}

export type ShareDownloadCheck =
  | { status: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "EXHAUSTED" }
  | { status: "OK"; documentId: string; shareId: string; createdBy: string; recipientLabel: string };

/** Read-only variant of the same checks, for the download proxy — does not count as a view. */
export async function checkShareDownloadable(token: string): Promise<ShareDownloadCheck> {
  const share = await prisma.documentShare.findUnique({ where: { token } });
  if (!share) return { status: "NOT_FOUND" };
  if (share.revokedAt) return { status: "REVOKED" };
  if (share.expiresAt < new Date()) return { status: "EXPIRED" };
  if (share.viewCount >= share.maxViews) return { status: "EXHAUSTED" };
  return {
    status: "OK",
    documentId: share.documentId,
    shareId: share.id,
    createdBy: share.createdBy,
    recipientLabel: share.recipientLabel,
  };
}
