import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";

export const runtime = "nodejs";

// GET /api/v1/documents/{documentId}/versions/{versionId}/redaction-suggestions
// docs/04-api-spec.md endpoint 2. Suggestion-only — nothing returned here
// is, or ever becomes, an input to any hash (CLAUDE.md rule 2).
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  try {
    requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  // Tile has no documentVersionId (see lib/tiles-repo.ts) — these are
  // always the CURRENT version's tiles. If versionId isn't the document's
  // latest version, say so explicitly rather than silently returning stale data.
  const document = await prisma.document.findUnique({ where: { id: params.documentId } });
  const isCurrentVersion = document?.currentVersionId === version.id;

  const flags = await prisma.redactionFlag.findMany({
    where: { tile: { documentId: params.documentId } },
    include: { tile: true },
  });

  return Response.json({
    document_version_id: params.versionId,
    // ai-service's outcome isn't tracked as its own field anywhere in the
    // schema (only whether RedactionFlag rows exist) — see the audit
    // report for step 5. This used to incorrectly key off
    // DocumentVersion.status (a different concern: overall document
    // processing, not AI suggestion outcome specifically).
    status: flags.length > 0 ? "READY" : "PENDING",
    is_current_version: isCurrentVersion,
    suggestions: flags.map((f) => ({
      id: f.id,
      tile_id: f.tileId,
      tile_index: f.tile.tileIndex,
      page_index: f.tile.pageIndex,
      row: f.tile.row,
      col: f.tile.col,
      entity_type: f.entityType,
      confidence_score: f.confidenceScore,
      source: f.source,
      masked: f.masked,
    })),
  });
}
