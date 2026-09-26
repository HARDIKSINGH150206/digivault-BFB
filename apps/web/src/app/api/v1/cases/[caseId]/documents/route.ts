import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";

export const runtime = "nodejs";

const ALL_ROLES = [
  Role.POLICE_OFFICER,
  Role.INVESTIGATING_OFFICER,
  Role.COURT_OFFICIAL,
  Role.FORENSIC_LAB,
  Role.ADMIN,
];

// GET /api/v1/cases/{caseId}/documents — list documents (+ current version) for a case.
// Same "not in docs/04" note as ../route.ts.
export async function GET(
  req: Request,
  { params }: { params: { caseId: string } }
): Promise<Response> {
  try {
    requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const documents = await prisma.document.findMany({
    where: { caseId: params.caseId },
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });

  return Response.json({
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      doc_type: d.docType,
      source_type: d.sourceType,
      current_version_id: d.currentVersionId,
      latest_version_no: d.versions[0]?.versionNo ?? null,
      latest_status: d.versions[0]?.status ?? null,
      created_at: d.createdAt.toISOString(),
    })),
  });
}
