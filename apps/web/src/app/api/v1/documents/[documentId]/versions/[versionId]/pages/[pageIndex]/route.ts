import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getPagePng } from "@/lib/storage";

export const runtime = "nodejs";

const ALL_ROLES = [
  Role.POLICE_OFFICER,
  Role.INVESTIGATING_OFFICER,
  Role.COURT_OFFICIAL,
  Role.FORENSIC_LAB,
  Role.ADMIN,
];

/**
 * GET /api/v1/documents/{documentId}/versions/{versionId}/pages/{pageIndex}
 * Authenticated, internal — lets someone with a real DigiVault login pull
 * a version's page PNGs to build the verification bundle they hand to a
 * court/defense lawyer (alongside GET .../proof). NOT called by the
 * /verify portal itself, which never talks to this backend at all.
 */
export async function GET(
  req: Request,
  { params }: { params: { documentId: string; versionId: string; pageIndex: string } }
): Promise<Response> {
  try {
    requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const version = await prisma.documentVersion.findUnique({ where: { id: params.versionId } });
  if (!version || version.documentId !== params.documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const pageIndex = Number(params.pageIndex);
  let png: Buffer;
  try {
    png = await getPagePng(`${params.documentId}/v${version.versionNo}/page-${pageIndex}.png`);
  } catch {
    return Response.json({ error: "NOT_FOUND", message: "Page not found in storage." }, { status: 404 });
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="page-${pageIndex}.png"`,
    },
  });
}
