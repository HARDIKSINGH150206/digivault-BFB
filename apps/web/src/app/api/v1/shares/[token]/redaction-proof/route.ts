import { prisma } from "@/lib/prisma";
import { checkShareDownloadable, getLatestRedactedVersion, shareErrorResponse } from "@/lib/shares-repo";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { TileBackfillError } from "@/lib/tiles-repo";
import { buildRedactionProof, RedactionProofError, redactionProofErrorResponse } from "@/lib/redaction-proof";

export const runtime = "nodejs";

/**
 * GET /api/v1/shares/{token}/redaction-proof — unauthenticated,
 * token-as-credential (docs/04 §7). The redaction proof for the version the
 * share serves (the newest redacted one, F-03), so a recipient can check
 * the copy at /verify against the ORIGINAL's anchor without an account.
 * Same revoke/expiry/view-limit checks as the PDF download, not counted as
 * a view. Identical to the officer route's proof (lib/redaction-proof.ts):
 * the original's salts for unmasked tiles only, so no masked pixel can be
 * recovered from it, and no original page is ever served.
 */
export async function GET(req: Request, { params }: { params: { token: string } }): Promise<Response> {
  const check = await checkShareDownloadable(params.token);
  if (check.status !== "OK") return shareErrorResponse(check.status);

  const shared = await getLatestRedactedVersion(check.documentId);
  if (!shared) {
    return Response.json({ error: "NO_REDACTED_VERSION", message: "No redacted version available for sharing" }, { status: 403 });
  }
  const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: shared.id } });

  let built;
  try {
    built = await buildRedactionProof(version);
  } catch (err) {
    if (err instanceof RedactionProofError) return redactionProofErrorResponse(err);
    if (err instanceof TileBackfillError) {
      return Response.json({ error: "INTEGRITY_ERROR", message: err.message }, { status: 409 });
    }
    throw err;
  }

  // Attributed to the share's creator; see resolveShareView in lib/shares-repo.ts.
  await writeAuditLog({
    actorId: check.createdBy,
    action: "SHARE_LINK_REDACTION_PROOF_DOWNLOADED",
    targetId: check.shareId,
    targetType: "DocumentShare",
    targetMeta: {
      accessedBy: "share_recipient",
      recipientLabel: check.recipientLabel,
      documentId: check.documentId,
      versionId: version.id,
      versionNo: version.versionNo,
      originalVersionId: built.original.id,
      maskedTileCount: built.maskedCount,
    },
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(built.proof);
}
