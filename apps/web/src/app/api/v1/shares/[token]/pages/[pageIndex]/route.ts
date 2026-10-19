import { prisma } from "@/lib/prisma";
import { getPagePng } from "@/lib/storage";
import { checkShareDownloadable, getLatestRedactedVersion, shareErrorResponse } from "@/lib/shares-repo";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { getVersionPageIndices } from "@/lib/tiles-repo";

export const runtime = "nodejs";

/**
 * GET /api/v1/shares/{token}/pages/{pageIndex} — unauthenticated,
 * token-as-credential (docs/04 §7). One lossless page PNG of the version the
 * share serves (the newest redacted one, F-03 — never the original). These
 * exact bytes, with GET .../redaction-proof, are what /verify needs: the
 * PDF from .../download re-encodes the pages and can't be verified.
 * Same checks as the PDF download, not counted as a view.
 */
export async function GET(req: Request, { params }: { params: { token: string; pageIndex: string } }): Promise<Response> {
  const check = await checkShareDownloadable(params.token);
  if (check.status !== "OK") return shareErrorResponse(check.status);

  const shared = await getLatestRedactedVersion(check.documentId);
  if (!shared) {
    return Response.json({ error: "NO_REDACTED_VERSION", message: "No redacted version available for sharing" }, { status: 403 });
  }
  const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: shared.id } });

  const pageIndex = Number(params.pageIndex);
  const pageIndices = await getVersionPageIndices(version);
  if (!/^\d+$/.test(params.pageIndex) || !pageIndices.includes(pageIndex)) {
    return Response.json({ error: "NOT_FOUND", message: "Page not found." }, { status: 404 });
  }
  const png = await getPagePng(`${check.documentId}/v${version.versionNo}/page-${pageIndex}.png`);

  // Attributed to the share's creator; see resolveShareView in lib/shares-repo.ts.
  await writeAuditLog({
    actorId: check.createdBy,
    action: "SHARE_LINK_PAGE_DOWNLOADED",
    targetId: check.shareId,
    targetType: "DocumentShare",
    targetMeta: {
      accessedBy: "share_recipient",
      recipientLabel: check.recipientLabel,
      documentId: check.documentId,
      versionId: version.id,
      versionNo: version.versionNo,
      pageIndex,
    },
    sourceIp: sourceIpFromRequest(req),
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="page-${pageIndex}.png"`,
    },
  });
}
