import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { getPagePng, putPagePng } from "@/lib/storage";
import { redactPagePng, recomputeDocumentHashes } from "@/lib/server-hash";
import { computeChainHash } from "@/lib/chain-hash";
import { replaceDocumentTiles } from "@/lib/tiles-repo";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";

export const runtime = "nodejs";

interface ConfirmBody {
  confirmed_tile_indices: number[];
}

// POST /api/v1/documents/{documentId}/versions/{versionId}/redactions/confirm
// docs/04-api-spec.md endpoint 3. Human-in-the-loop finalization — nothing
// redacts silently. The redacted version's merkle_root is ALWAYS computed
// server-side from the server's own redacted PNGs, never from a
// client-submitted root, mirroring CLAUDE.md rule 4 for this step too.
export async function POST(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const body = (await req.json()) as ConfirmBody;
  const { documentId, versionId } = params;

  const priorVersion = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!priorVersion || priorVersion.documentId !== documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  const tiles = await prisma.tile.findMany({
    where: { documentId, tileIndex: { in: body.confirmed_tile_indices } },
  });
  if (tiles.length !== body.confirmed_tile_indices.length) {
    return Response.json(
      { error: "BAD_REQUEST", message: "One or more confirmed_tile_indices don't exist on this document." },
      { status: 400 }
    );
  }

  const tilesByPage = new Map<number, { row: number; col: number }[]>();
  for (const t of tiles) {
    const list = tilesByPage.get(t.pageIndex) ?? [];
    list.push({ row: t.row, col: t.col });
    tilesByPage.set(t.pageIndex, list);
  }

  const gridSize = priorVersion.gridSize;
  const pageCount = Math.max(...tiles.map((t) => t.pageIndex), 0) + 1; // lower bound; refined below
  const allPageIndices = await prisma.tile.findMany({
    where: { documentId },
    distinct: ["pageIndex"],
    select: { pageIndex: true },
  });
  const totalPages = allPageIndices.length || pageCount;

  const redactedBuffers: Buffer[] = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const original = await getPagePng(`${documentId}/v${priorVersion.versionNo}/page-${pageIndex}.png`);
    const masks = tilesByPage.get(pageIndex) ?? [];
    redactedBuffers.push(masks.length > 0 ? await redactPagePng(original, gridSize, masks) : original);
  }

  const serverComputed = await recomputeDocumentHashes(redactedBuffers, gridSize);

  const versionNo = priorVersion.versionNo + 1;
  const timestamp = new Date();
  const chainHash = await computeChainHash({
    previousHash: priorVersion.chainHash,
    merkleRoot: serverComputed.merkleRoot,
    versionNo,
    timestamp,
  });

  const storagePrefix = `${documentId}/v${versionNo}`;
  for (let i = 0; i < redactedBuffers.length; i++) {
    await putPagePng(`${storagePrefix}/page-${i}.png`, redactedBuffers[i]);
  }
  const storageUri = `s3://${process.env.MINIO_BUCKET ?? "digivault-evidence"}/${storagePrefix}/`;

  const newVersion = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo,
      merkleRoot: serverComputed.merkleRoot,
      clientHash: serverComputed.clientHash,
      storageUri,
      previousHash: priorVersion.chainHash,
      chainHash,
      gridSize,
      uploadedById: actor.userId,
      status: "PROCESSING",
      timestamp,
    },
  });

  await replaceDocumentTiles(documentId, serverComputed.tiles);

  // The old RedactionFlag rows were deleted by replaceDocumentTiles along
  // with the old Tile rows (see lib/tiles-repo.ts) — recreate confirmed
  // ones against the new Tile rows so `masked: true` survives the version bump.
  const newTiles = await prisma.tile.findMany({
    where: { documentId, tileIndex: { in: body.confirmed_tile_indices } },
  });
  await prisma.redactionFlag.createMany({
    data: newTiles.map((t) => ({
      tileId: t.id,
      entityType: "officer_confirmed",
      confidenceScore: 1,
      masked: true,
      source: "officer_manual",
    })),
  });

  await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: newVersion.id } });

  await writeAuditLog({
    actorId: actor.userId,
    action: "CONFIRM_REDACTIONS",
    targetId: newVersion.id,
    sourceIp: sourceIpFromRequest(req),
  });

  return Response.json(
    {
      document_version_id: newVersion.id,
      version_no: versionNo,
      previous_hash: priorVersion.chainHash,
      chain_hash: chainHash,
      merkle_root: serverComputed.merkleRoot,
      status: newVersion.status,
      redacted_tile_count: body.confirmed_tile_indices.length,
    },
    { status: 201 }
  );
}
