import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { CaseFieldError, caseJson, parseFirRegisteredAt, parseOffenceSections } from "@/lib/case-json";

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

  const now = new Date();
  return Response.json({ cases: cases.map((c) => caseJson(c, c._count.documents, now)) });
}

interface CreateCaseBody {
  case_number: string;
  case_type: string;
  status?: string;
  department: string;
  /** BNSS s.193(2) (docs/07 Phase 7): "YYYY-MM-DD" or ISO timestamp. */
  fir_registered_at?: string | null;
  /** e.g. ["BNS 64", "POCSO 4"] or "BNS 64, 74". */
  offence_sections?: string | string[];
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

  let firRegisteredAt: Date | null = null;
  let offenceSections: string[] = [];
  try {
    if (body.fir_registered_at !== undefined) firRegisteredAt = parseFirRegisteredAt(body.fir_registered_at);
    if (body.offence_sections !== undefined) offenceSections = parseOffenceSections(body.offence_sections);
  } catch (err) {
    if (err instanceof CaseFieldError) return Response.json({ error: "BAD_REQUEST", message: err.message }, { status: 400 });
    throw err;
  }

  const created = await prisma.case.create({
    data: {
      firRegisteredAt,
      offenceSections,
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
    targetType: "Case",
    targetMeta: { firRegisteredAt: firRegisteredAt?.toISOString() ?? null, offenceSections },
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(caseJson(created, 0), { status: 201 });
}
