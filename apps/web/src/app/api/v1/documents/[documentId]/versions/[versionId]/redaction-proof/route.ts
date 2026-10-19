import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { TileBackfillError } from "@/lib/tiles-repo";
import { buildRedactionProof, RedactionProofError, redactionProofErrorResponse } from "@/lib/redaction-proof";

export const runtime = "nodejs";

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}/redaction-proof
 * docs/04-api-spec.md endpoint 5b. The redaction proof for a redacted
 * version: with the version's page PNGs, the public portal shows that the
 * copy is the original anchored document except for the masked tiles
 * (docs/03 §Redaction proofs). Never contains a masked tile's original
 * salt. Self-checked before it is served (lib/redaction-proof.ts).
 */
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [
      Role.POLICE_OFFICER,
      Role.INVESTIGATING_OFFICER,
      Role.COURT_OFFICIAL,
      Role.FORENSIC_LAB,
      Role.ADMIN,
    ]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

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

  await writeAuditLog({
    actorId: actor.userId,
    action: "DOWNLOAD_REDACTION_PROOF",
    targetId: version.id,
    targetType: "DocumentVersion",
    targetMeta: {
      versionNo: version.versionNo,
      originalVersionId: built.original.id,
      originalVersionNo: built.original.versionNo,
      maskedTileCount: built.maskedCount,
      pageCount: built.proof.pages.length,
    },
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(built.proof);
}
