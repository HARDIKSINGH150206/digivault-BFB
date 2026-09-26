import { prisma } from "./prisma";

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
        latestAnchoredVersion: {
          id: string;
          versionNo: number;
          merkleRoot: string;
          chainHash: string;
          timestamp: Date;
          storageUri: string;
          polygonTxHash: string | null;
        } | null;
      };
    };

/**
 * Looks up a share by token, enforces revoke/expiry/view-limit, and — only
 * on success — increments viewCount. Shared by GET /api/v1/shares/{token}
 * (the API contract) and the unauthenticated recipient page (apps/web/src/
 * app/shares/[token]/page.tsx), which renders server-side directly off
 * Prisma rather than round-tripping through its own API — so "a view" is
 * counted exactly once no matter which caller triggers it.
 */
export async function resolveShareView(token: string): Promise<ShareViewResult> {
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

  const latestVersion = await getLatestAnchoredVersion(share.documentId);

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
      latestAnchoredVersion: latestVersion,
    },
  };
}

type LatestAnchoredVersion = {
  id: string;
  versionNo: number;
  merkleRoot: string;
  chainHash: string;
  timestamp: Date;
  storageUri: string;
  polygonTxHash: string | null;
};

async function getLatestAnchoredVersion(documentId: string): Promise<LatestAnchoredVersion | null> {
  const versions = await prisma.documentVersion.findMany({
    where: { documentId, anchors: { some: {} } },
    orderBy: { timestamp: "desc" },
    take: 1,
    include: { anchors: { orderBy: { anchoredAt: "desc" }, take: 1 } },
  });
  const version = versions[0];
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
  | { status: "OK"; documentId: string };

/** Read-only variant of the same checks, for the download proxy — does not count as a view. */
export async function checkShareDownloadable(token: string): Promise<ShareDownloadCheck> {
  const share = await prisma.documentShare.findUnique({ where: { token } });
  if (!share) return { status: "NOT_FOUND" };
  if (share.revokedAt) return { status: "REVOKED" };
  if (share.expiresAt < new Date()) return { status: "EXPIRED" };
  if (share.viewCount >= share.maxViews) return { status: "EXHAUSTED" };
  return { status: "OK", documentId: share.documentId };
}
