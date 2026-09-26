import { Role, DocumentSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { recomputeDocumentHashes } from "@/lib/server-hash";
import { putPagePng } from "@/lib/storage";
import { computeChainHash } from "@/lib/chain-hash";
import { replaceDocumentTiles } from "@/lib/tiles-repo";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { requestRedactionSuggestions } from "@/lib/ai-service";
import { persistSuggestionsAsFlags } from "@/lib/redaction-suggestions-repo";

export const runtime = "nodejs";

interface UploadMetadata {
  case_id?: string;
  document_id?: string | null;
  title?: string;
  doc_type?: string;
  source_type?: DocumentSourceType;
  grid_size: number;
  page_count: number;
  client_hash: string;
  merkle_root: string;
  tiles: { tile_index: number; page_index: number; row: number; col: number; hash: string }[];
  pages: { page_index: number; width_px: number; height_px: number }[];
}

// POST /api/v1/evidence/upload — docs/04-api-spec.md endpoint 1.
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, [Role.POLICE_OFFICER, Role.INVESTIGATING_OFFICER, Role.ADMIN]);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const form = await req.formData();
  const metadataRaw = form.get("metadata");
  if (typeof metadataRaw !== "string") {
    return Response.json({ error: "BAD_REQUEST", message: "Missing metadata part." }, { status: 400 });
  }
  const metadata = JSON.parse(metadataRaw) as UploadMetadata;

  if (metadata.tiles.length !== metadata.page_count * metadata.grid_size ** 2) {
    return Response.json(
      { error: "BAD_REQUEST", message: "tiles.length must equal page_count * grid_size^2." },
      { status: 400 }
    );
  }

  const pageBuffers: Buffer[] = [];
  for (let i = 0; i < metadata.page_count; i++) {
    const file = form.get(`page_${i}`);
    if (!(file instanceof File)) {
      return Response.json(
        { error: "BAD_REQUEST", message: `Missing binary part page_${i}.` },
        { status: 400 }
      );
    }
    pageBuffers.push(Buffer.from(await file.arrayBuffer()));
  }

  // --- Server-side hash re-verification (CLAUDE.md rule 4) ---
  // Never trust metadata.client_hash / metadata.merkle_root directly:
  // recompute both from the PNG bytes actually received and compare.
  const serverComputed = await recomputeDocumentHashes(pageBuffers, metadata.grid_size);

  if (
    serverComputed.clientHash !== metadata.client_hash ||
    serverComputed.merkleRoot !== metadata.merkle_root
  ) {
    const submittedByIndex = new Map(metadata.tiles.map((t) => [t.tile_index, t.hash]));
    const mismatchedTileIndices = serverComputed.tiles
      .filter((t) => submittedByIndex.get(t.index) !== t.hashHex)
      .map((t) => t.index);

    return Response.json(
      {
        error: "HASH_MISMATCH",
        message: "Server-recomputed merkle_root/client_hash does not match submitted values.",
        mismatched_tile_indices: mismatchedTileIndices,
      },
      { status: 409 }
    );
  }

  let documentId = metadata.document_id ?? null;
  let versionNo = 1;
  let previousHash: string | null = null;

  if (documentId) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      return Response.json({ error: "NOT_FOUND", message: "document_id does not exist." }, { status: 404 });
    }
    const latestVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNo: "desc" },
    });
    versionNo = (latestVersion?.versionNo ?? 0) + 1;
    previousHash = latestVersion?.chainHash ?? null;
  } else {
    if (!metadata.case_id || !metadata.title || !metadata.doc_type || !metadata.source_type) {
      return Response.json(
        { error: "BAD_REQUEST", message: "case_id, title, doc_type, source_type required for a new document." },
        { status: 400 }
      );
    }
    const created = await prisma.document.create({
      data: {
        caseId: metadata.case_id,
        title: metadata.title,
        docType: metadata.doc_type,
        sourceType: metadata.source_type,
        uploaderId: actor.userId,
      },
    });
    documentId = created.id;
  }

  const timestamp = new Date();
  const chainHash = await computeChainHash({
    previousHash,
    merkleRoot: serverComputed.merkleRoot,
    versionNo,
    timestamp,
  });

  const storagePrefix = `${documentId}/v${versionNo}`;
  for (let i = 0; i < pageBuffers.length; i++) {
    await putPagePng(`${storagePrefix}/page-${i}.png`, pageBuffers[i]);
  }
  const storageUri = `s3://${process.env.MINIO_BUCKET ?? "digivault-evidence"}/${storagePrefix}/`;

  const version = await prisma.documentVersion.create({
    data: {
      documentId,
      versionNo,
      merkleRoot: serverComputed.merkleRoot,
      clientHash: serverComputed.clientHash,
      storageUri,
      previousHash,
      chainHash,
      gridSize: metadata.grid_size,
      uploadedById: actor.userId,
      status: "PROCESSING",
      timestamp,
    },
  });

  await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } });
  await replaceDocumentTiles(documentId, serverComputed.tiles);

  await writeAuditLog({
    actorId: actor.userId,
    action: "UPLOAD_DOCUMENT_VERSION",
    targetId: version.id,
    sourceIp: sourceIpFromRequest(req),
  });

  // docs/02 step 10-11: send pages to ai-service for redaction targeting.
  // Real HTTP call (apps/ai-service, currently a fake-data stub — see
  // docs/05-ai-service audit notes), not another stub on this side. Per
  // CLAUDE.md rule 2, a failure/timeout here must NEVER fail the upload —
  // the document is already fully hashed and stored above.
  try {
    const suggestions = await requestRedactionSuggestions(
      version.id,
      metadata.grid_size,
      metadata.pages.map((p, i) => ({
        pageIndex: p.page_index,
        widthPx: p.width_px,
        heightPx: p.height_px,
        pngBytes: pageBuffers[i],
      }))
    );
    await persistSuggestionsAsFlags(documentId, suggestions);
  } catch (err) {
    console.error(`[upload] ai-service call failed for version ${version.id}, continuing without suggestions:`, err);
  }

  return Response.json(
    {
      document_id: documentId,
      document_version_id: version.id,
      version_no: versionNo,
      status: version.status,
      grid_size: metadata.grid_size,
      merkle_root: serverComputed.merkleRoot,
      client_hash: serverComputed.clientHash,
      storage_uri: storageUri,
      created_at: timestamp.toISOString(),
    },
    { status: 201 }
  );
}
