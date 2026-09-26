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

/**
 * GET /api/v1/cases/{caseId} — a single case's own details. Same "not in
 * docs/04" note as ../route.ts: the case-detail page needs this (case
 * type/status/department) alongside its documents sub-list, and until now
 * only the list endpoint (GET /api/v1/cases) returned that data.
 */
export async function GET(req: Request, { params }: { params: { caseId: string } }): Promise<Response> {
  try {
    requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const kase = await prisma.case.findUnique({
    where: { id: params.caseId },
    include: { _count: { select: { documents: true } } },
  });
  if (!kase) {
    return Response.json({ error: "NOT_FOUND", message: "Case not found." }, { status: 404 });
  }

  return Response.json({
    id: kase.id,
    case_number: kase.caseNumber,
    case_type: kase.caseType,
    status: kase.status,
    department: kase.department,
    document_count: kase._count.documents,
    created_at: kase.createdAt.toISOString(),
  });
}
