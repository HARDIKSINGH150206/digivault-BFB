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
      redactedVersion: result.document.redactedVersion
        ? {
            id: result.document.redactedVersion.id,
            versionNo: result.document.redactedVersion.versionNo,
            merkleRoot: result.document.redactedVersion.merkleRoot,
            chainHash: result.document.redactedVersion.chainHash,
            timestamp: result.document.redactedVersion.timestamp.toISOString(),
            storageUri: result.document.redactedVersion.storageUri,
            polygonTxHash: result.document.redactedVersion.polygonTxHash,
          }
        : null,
    },
  });
}
