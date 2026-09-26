import { resolveShareView } from "@/lib/shares-repo";
import { sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

const ERROR_RESPONSES = {
  NOT_FOUND: { status: 404 as const, body: { error: "NOT_FOUND", message: "Share link not found." } },
  REVOKED: { status: 410 as const, body: { error: "SHARE_REVOKED", message: "This link has been revoked" } },
  EXPIRED: { status: 410 as const, body: { error: "SHARE_EXPIRED", message: "This link has expired" } },
  EXHAUSTED: {
    status: 410 as const,
    body: { error: "SHARE_EXHAUSTED", message: "This link has reached its maximum number of views" },
  },
};

// GET /api/v1/shares/{token} — consent-based, unauthenticated document view.
// The token itself is the credential; no session/RBAC check on this route.
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
): Promise<Response> {
  // Audited as SHARE_LINK_ACCESSED inside resolveShareView.
  const result = await resolveShareView(params.token, sourceIpFromRequest(req));

  if (result.status !== "OK") {
    const { status, body } = ERROR_RESPONSES[result.status];
    return Response.json(body, { status });
  }

  return Response.json({
    recipientLabel: result.recipientLabel,
    expiresAt: result.expiresAt.toISOString(),
    viewsRemaining: result.viewsRemaining,
    document: {
      id: result.document.id,
      title: result.document.title,
      docType: result.document.docType,
      caseNumber: result.document.caseNumber,
      latestAnchoredVersion: result.document.latestAnchoredVersion
        ? {
            id: result.document.latestAnchoredVersion.id,
            versionNo: result.document.latestAnchoredVersion.versionNo,
            merkleRoot: result.document.latestAnchoredVersion.merkleRoot,
            chainHash: result.document.latestAnchoredVersion.chainHash,
            timestamp: result.document.latestAnchoredVersion.timestamp.toISOString(),
            storageUri: result.document.latestAnchoredVersion.storageUri,
            polygonTxHash: result.document.latestAnchoredVersion.polygonTxHash,
          }
        : null,
    },
  });
}
