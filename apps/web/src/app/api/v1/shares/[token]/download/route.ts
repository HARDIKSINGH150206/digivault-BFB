import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getPagePng } from "@/lib/storage";
import { checkShareDownloadable } from "@/lib/shares-repo";

export const runtime = "nodejs";

const ERROR_RESPONSES = {
  NOT_FOUND: { status: 404 as const, body: { error: "NOT_FOUND", message: "Share link not found." } },
  REVOKED: { status: 410 as const, body: { error: "SHARE_REVOKED", message: "This link has been revoked" } },
  EXPIRED: { status: 410 as const, body: { error: "SHARE_EXPIRED", message: "This link has expired" } },
  EXHAUSTED: {
    status: 410 as const,
    body: { error: "SHARE_EXHAUSTED", message: "This link has reached its maximum number of views" },
  },
};

/**
 * GET /api/v1/shares/{token}/download — unauthenticated, token-as-credential.
 * storageUri (s3://...) is a MinIO-internal key, not a fetchable URL, and the
 * only routes that can read page PNGs out of MinIO (.../pages/{pageIndex})
 * require an authenticated session — unusable for a share recipient. This
 * proxies the anchored version's page PNGs through the same revoke/expiry/
 * view-limit checks as GET /api/v1/shares/{token} (without counting as an
 * extra view), bundling them into one PDF with pdf-lib (already a
 * dependency — see the certificate route) so the recipient gets a single
 * "redacted document" download.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
): Promise<Response> {
  const check = await checkShareDownloadable(params.token);
  if (check.status !== "OK") {
    const { status, body } = ERROR_RESPONSES[check.status];
    return Response.json(body, { status });
  }

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: check.documentId, anchors: { some: {} } },
    orderBy: { timestamp: "desc" },
    take: 1,
  });
  const latestVersion = versions[0];
  if (!latestVersion) {
    return Response.json(
      { error: "NOT_ANCHORED", message: "This document has not completed anchoring yet." },
      { status: 409 }
    );
  }

  const tiles = await prisma.tile.findMany({
    where: { documentId: check.documentId },
    select: { pageIndex: true },
    distinct: ["pageIndex"],
    orderBy: { pageIndex: "asc" },
  });

  const pdf = await PDFDocument.create();
  for (const { pageIndex } of tiles) {
    const png = await getPagePng(`${check.documentId}/v${latestVersion.versionNo}/page-${pageIndex}.png`);
    const embedded = await pdf.embedPng(png);
    const page = pdf.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  const pdfBytes = await pdf.save();

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="evidence-document-v${latestVersion.versionNo}.pdf"`,
    },
  });
}
