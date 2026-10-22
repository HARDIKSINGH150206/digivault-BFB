import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { requireStepUp } from "@/lib/step-up";
import { getPagePng, putPagePng } from "@/lib/storage";
import { chainHashV2 } from "@digivault/crypto-core";
import { redactPagePng, recomputeDocumentHashesV2 } from "@/lib/server-hash";
import { createVersionTiles, getVersionTiles, TileBackfillError } from "@/lib/tiles-repo";
import { generateTileSalts, saltKeyFromEnv, storeVersionSalts, type SaltKey } from "@/lib/tile-salts";
import { PROOF_V2 } from "@/lib/proof-v2";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { anchorVersionInBackground } from "@/lib/anchor";
import { addConfirmedNames } from "@/lib/gazetteer";

export const runtime = "nodejs";

interface ConfirmBody {
  confirmed_tile_indices: number[];
}

// POST /api/v1/documents/{documentId}/versions/{versionId}/redactions/confirm
// docs/04-api-spec.md endpoint 3. Human-in-the-loop finalization — nothing
// redacts silently. The redacted version's merkle_root is ALWAYS computed
// server-side from the server's own redacted PNGs, never from a
// client-submitted root, mirroring CLAUDE.md rule 4 for this step too.
// The redacted version is always v2 (ADR-021), whatever the prior version
// was, with FRESH server-generated salts: reusing the prior version's salts
// would hand a masked tile's original salt to anyone given the redacted
// version's proof (ADR-018).
export async function POST(
  req: Request,
  { params }: { params: { documentId: string; versionId: string } }
): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
    requireStepUp(req, actor);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  let saltKey: SaltKey;
  try {
    saltKey = saltKeyFromEnv();
  } catch (err) {
    console.error("[confirm] salt encryption key unavailable:", err);
    return Response.json(
      { error: "SERVER_MISCONFIGURED", message: "Redaction is disabled: the salt encryption key is not configured." },
      { status: 503 }
    );
  }

  const body = (await req.json()) as ConfirmBody;
  const { documentId, versionId } = params;

  const priorVersion = await prisma.documentVersion.findUnique({ where: { id: versionId } });
  if (!priorVersion || priorVersion.documentId !== documentId) {
    return Response.json({ error: "NOT_FOUND", message: "Document version not found." }, { status: 404 });
  }

  let priorTiles;
  try {
    priorTiles = await getVersionTiles(priorVersion);
  } catch (err) {
    if (err instanceof TileBackfillError) {
      return Response.json({ error: "INTEGRITY_ERROR", message: err.message }, { status: 409 });
    }
    throw err;
  }
  const confirmed = new Set(body.confirmed_tile_indices);
  const tiles = priorTiles.filter((t) => confirmed.has(t.tileIndex));
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
  const totalPages = new Set(priorTiles.map((t) => t.pageIndex)).size || pageCount;

  const redactedBuffers: Buffer[] = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const original = await getPagePng(`${documentId}/v${priorVersion.versionNo}/page-${pageIndex}.png`);
    const masks = tilesByPage.get(pageIndex) ?? [];
    redactedBuffers.push(masks.length > 0 ? await redactPagePng(original, gridSize, masks) : original);
  }

  const salts = generateTileSalts(redactedBuffers.length * gridSize * gridSize);
  const serverComputed = await recomputeDocumentHashesV2(redactedBuffers, gridSize, salts);

  const versionNo = priorVersion.versionNo + 1;
  const timestamp = new Date();
  const chainHash = chainHashV2({ previousHash: priorVersion.chainHash, commitment: serverComputed.commitment, versionNo, timestamp });

  const storagePrefix = `${documentId}/v${versionNo}`;
  for (let i = 0; i < redactedBuffers.length; i++) {
    await putPagePng(`${storagePrefix}/page-${i}.png`, redactedBuffers[i]);
  }
  const storageUri = `s3://${process.env.MINIO_BUCKET ?? "digivault-evidence"}/${storagePrefix}/`;

  let newVersion = await prisma.$transaction(async (tx) => {
    const created = await tx.documentVersion.create({
      data: {
        documentId,
        versionNo,
        proofVersion: PROOF_V2,
        merkleRoot: serverComputed.documentRoot,
        commitment: serverComputed.commitment,
        clientHash: serverComputed.fileHash,
        storageUri,
        previousHash: priorVersion.chainHash,
        chainHash,
        gridSize,
        uploadedById: actor.userId,
        status: "PROCESSING",
        timestamp,
      },
    });
    await storeVersionSalts(created.id, salts, saltKey, tx);
    return created;
  });

  await createVersionTiles(documentId, newVersion.id, serverComputed.tiles);

  // The prior version keeps its own tiles and AI suggestion flags (ADR-024);
  // the new version gets officer-confirmed flags on its own tiles so
  // `masked: true` is visible on the redacted version.
  const newTiles = await prisma.tile.findMany({
    where: { documentVersionId: newVersion.id, tileIndex: { in: body.confirmed_tile_indices } },
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

  const document = await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: newVersion.id } });

  // Names on the tiles the officer just confirmed join the case gazetteer, so
  // they are flagged in the case's other documents (ADR-034). Never throws.
  const gazetteerNamesAdded = await addConfirmedNames({
    caseId: document.caseId,
    priorVersionId: priorVersion.id,
    newVersionId: newVersion.id,
    confirmedTileIds: tiles.map((t) => t.id),
    actorId: actor.userId,
  });

  // Only now — pages, tiles and flags all written — is this a complete
  // redacted version that share links may serve (see shares/[token]/download).
  newVersion = await prisma.documentVersion.update({
    where: { id: newVersion.id },
    data: { status: "READY", isRedacted: true },
  });

  await writeAuditLog({
    actorId: actor.userId,
    action: "CONFIRM_REDACTIONS",
    targetId: newVersion.id,
    targetType: "DocumentVersion",
    sourceIp: sourceIpFromRequest(req),
  });
  await writeAuditLog({
    actorId: actor.userId,
    action: "CONFIRM_REDACTIONS_DETAIL",
    targetId: newVersion.id,
    targetType: "DocumentVersion",
    targetMeta: {
      priorVersionId: priorVersion.id,
      priorVersionNo: priorVersion.versionNo,
      versionNo,
      redactedTileIndices: [...body.confirmed_tile_indices].sort((a, b) => a - b),
      gazetteerNamesAdded,
      tilesByPage: Object.fromEntries(
        [...tilesByPage].map(([page, cells]) => [page, cells.map((c) => `R${c.row}C${c.col}`)])
      ),
    },
    sourceIp: sourceIpFromRequest(req),
  });

  // Every version is anchored (CLAUDE.md rule 3); never fails the confirm.
  anchorVersionInBackground(newVersion.id, actor.userId, sourceIpFromRequest(req));

  return Response.json(
    {
      document_version_id: newVersion.id,
      version_no: versionNo,
      previous_hash: priorVersion.chainHash,
      chain_hash: chainHash,
      proof_version: PROOF_V2,
      merkle_root: serverComputed.documentRoot,
      commitment: serverComputed.commitment,
      status: newVersion.status,
      anchor_status: "PENDING",
      redacted_tile_count: body.confirmed_tile_indices.length,
    },
    { status: 201 }
  );
}
