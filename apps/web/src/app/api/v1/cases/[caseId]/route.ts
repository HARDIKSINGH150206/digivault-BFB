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

  return Response.json(caseJson(kase, kase._count.documents));
}

/**
 * PATCH /api/v1/cases/{caseId} { fir_registered_at?, offence_sections? }
 * Sets the fields the BNSS s.193(2) deadline runs on (docs/07 Phase 7), for
 * cases created before them. Same roles as creating a case. Audited with
 * the old and new values: moving the registration date moves the deadline.
 */
export async function PATCH(req: Request, { params }: { params: { caseId: string } }): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const body = (await req.json().catch(() => null)) as { fir_registered_at?: unknown; offence_sections?: unknown } | null;
  if (!body || (body.fir_registered_at === undefined && body.offence_sections === undefined)) {
    return Response.json({ error: "BAD_REQUEST", message: "Send fir_registered_at and/or offence_sections." }, { status: 400 });
  }

  const data: { firRegisteredAt?: Date | null; offenceSections?: string[] } = {};
  try {
    if (body.fir_registered_at !== undefined) data.firRegisteredAt = parseFirRegisteredAt(body.fir_registered_at);
    if (body.offence_sections !== undefined) data.offenceSections = parseOffenceSections(body.offence_sections);
  } catch (err) {
    if (err instanceof CaseFieldError) return Response.json({ error: "BAD_REQUEST", message: err.message }, { status: 400 });
    throw err;
  }

  const before = await prisma.case.findUnique({ where: { id: params.caseId } });
  if (!before) return Response.json({ error: "NOT_FOUND", message: "Case not found." }, { status: 404 });

  const updated = await prisma.case.update({
    where: { id: params.caseId },
    data,
    include: { _count: { select: { documents: true } } },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "UPDATE_CASE_DEADLINE_FIELDS",
    targetId: updated.id,
    targetType: "Case",
    targetMeta: {
      before: { firRegisteredAt: before.firRegisteredAt?.toISOString() ?? null, offenceSections: before.offenceSections },
      after: { firRegisteredAt: updated.firRegisteredAt?.toISOString() ?? null, offenceSections: updated.offenceSections },
    },
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(caseJson(updated, updated._count.documents));
}
