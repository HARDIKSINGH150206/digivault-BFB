import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

const SHARE_MANAGER_ROLES = [Role.INVESTIGATING_OFFICER, Role.ADMIN];

// DELETE /api/v1/documents/{documentId}/shares/{shareId} — revoke a share link.
export async function DELETE(
  req: Request,
  { params }: { params: { documentId: string; shareId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, SHARE_MANAGER_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const share = await prisma.documentShare.findUnique({ where: { id: params.shareId } });
  if (!share || share.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Share not found." }, { status: 404 });
  }

  await prisma.documentShare.update({
    where: { id: params.shareId },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "SHARE_REVOKED",
    targetId: share.id,
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json({ message: "Share revoked" });
}
