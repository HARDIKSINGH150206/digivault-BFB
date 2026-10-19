import { resolveShareView, shareErrorResponse } from "@/lib/shares-repo";
import { sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/v1/shares/{token} — consent-based, unauthenticated document view.
// The token itself is the credential; no session/RBAC check on this route.
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
): Promise<Response> {
  // Audited as SHARE_LINK_ACCESSED inside resolveShareView.
  const result = await resolveShareView(params.token, sourceIpFromRequest(req));

  if (result.status !== "OK") return shareErrorResponse(result.status);

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
            commitment: result.document.redactedVersion.commitment,
            chainHash: result.document.redactedVersion.chainHash,
            timestamp: result.document.redactedVersion.timestamp.toISOString(),
            storageUri: result.document.redactedVersion.storageUri,
            polygonTxHash: result.document.redactedVersion.polygonTxHash,
          }
        : null,
    },
  });
}
