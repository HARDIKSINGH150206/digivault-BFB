import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

const ALL_ROLES = [
  Role.POLICE_OFFICER,
  Role.INVESTIGATING_OFFICER,
  Role.COURT_OFFICIAL,
  Role.FORENSIC_LAB,
  Role.ADMIN,
];

/**
 * Not in docs/04-api-spec.md — that spec only covers the evidence
 * lifecycle (upload/redact/anchor/verify), not case management. Document
 * creation already required an existing Case (Document.caseId is
 * required, non-nullable), so something has to list/create cases for the
 * dashboard to be usable at all. Minimal by design — this isn't the demo's
 * focus.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const cases = await prisma.case.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: true } } },
  });

  return Response.json({
    cases: cases.map((c) => ({
      id: c.id,
      case_number: c.caseNumber,
      case_type: c.caseType,
      status: c.status,
      department: c.department,
      document_count: c._count.documents,
      created_at: c.createdAt.toISOString(),
    })),
  });
}

interface CreateCaseBody {
  case_number: string;
  case_type: string;
  status?: string;
  department: string;
}

export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const body = (await req.json()) as CreateCaseBody;
  if (!body.case_number || !body.case_type || !body.department) {
    return Response.json(
      { error: "BAD_REQUEST", message: "case_number, case_type, department are required." },
      { status: 400 }
    );
  }

  const created = await prisma.case.create({
    data: {
      caseNumber: body.case_number,
      caseType: body.case_type,
      status: body.status ?? "OPEN",
      department: body.department,
      createdById: actor.userId,
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "CREATE_CASE",
    targetId: created.id,
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(
    {
      id: created.id,
      case_number: created.caseNumber,
      case_type: created.caseType,
      status: created.status,
      department: created.department,
      created_at: created.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
