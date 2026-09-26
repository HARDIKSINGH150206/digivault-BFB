import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

const SHARE_MANAGER_ROLES = [Role.INVESTIGATING_OFFICER, Role.ADMIN];

interface CreateShareBody {
  recipientLabel?: string;
  expiresAt?: string;
  maxViews?: number;
}

// POST /api/v1/documents/{documentId}/shares — create a consent-based share link.
export async function POST(
  req: Request,
  { params }: { params: { documentId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, SHARE_MANAGER_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const document = await prisma.document.findUnique({ where: { id: params.documentId } });
  if (!document) {
    return Response.json({ error: "NOT_FOUND", message: "Document not found." }, { status: 404 });
  }

  const body = (await req.json()) as CreateShareBody;
  if (!body.recipientLabel || !body.expiresAt || typeof body.maxViews !== "number") {
    return Response.json(
      { error: "BAD_REQUEST", message: "recipientLabel, expiresAt, and maxViews are required." },
      { status: 400 }
    );
  }

  const expiresAt = new Date(body.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return Response.json(
      { error: "BAD_REQUEST", message: "expiresAt must be a valid ISO date in the future." },
      { status: 400 }
    );
  }

  const share = await prisma.documentShare.create({
    data: {
      documentId: params.documentId,
      createdBy: actor.userId,
      recipientLabel: body.recipientLabel,
      expiresAt,
      maxViews: body.maxViews,
    },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "SHARE_CREATED",
    targetId: share.id,
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(
    {
      shareId: share.id,
      token: share.token,
      shareUrl: `/shares/${share.token}`,
      expiresAt: share.expiresAt.toISOString(),
      recipientLabel: share.recipientLabel,
      maxViews: share.maxViews,
    },
    { status: 201 }
  );
}

// GET /api/v1/documents/{documentId}/shares — list all share links for a document.
export async function GET(
  req: Request,
  { params }: { params: { documentId: string } }
): Promise<Response> {
  try {
    requireRole(req, SHARE_MANAGER_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const shares = await prisma.documentShare.findMany({
    where: { documentId: params.documentId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({
    shares: shares.map((s) => ({
      id: s.id,
      token: s.token,
      recipientLabel: s.recipientLabel,
      expiresAt: s.expiresAt.toISOString(),
      maxViews: s.maxViews,
      viewCount: s.viewCount,
      revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
