import { Prisma, Role, DocumentSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { chainHashV2 } from "@digivault/crypto-core";
import { recomputeDocumentHashesV2 } from "@/lib/server-hash";
import { putPagePng } from "@/lib/storage";
import { createVersionTiles } from "@/lib/tiles-repo";
import { saltKeyFromEnv, storeVersionSalts, type SaltKey } from "@/lib/tile-salts";
import { parseUploadSalts, PROOF_V2 } from "@/lib/proof-v2";
import { writeAuditLog, sourceIpFromRequest } from "@/lib/audit";
import { requestRedactionSuggestions } from "@/lib/ai-service";
import { caseGazetteer } from "@/lib/gazetteer";
import { persistSuggestionsAsFlags } from "@/lib/redaction-suggestions-repo";
import { anchorVersionInBackground } from "@/lib/anchor";

export const runtime = "nodejs";

interface UploadMetadata {
  case_id?: string;
  document_id?: string | null;
  title?: string;
  doc_type?: string;
  source_type?: DocumentSourceType;
  proof_version: number;
  grid_size: number;
  page_count: number;
  client_hash: string;
  /** Document root R (docs/03 §v2). */
  merkle_root: string;
  commitment: string;
  /** One 32-byte hex salt per tile, global tile order (ADR-018). */
  salts: string[];
  tiles: { tile_index: number; page_index: number; row: number; col: number; hash: string }[];
  pages: { page_index: number; width_px: number; height_px: number }[];
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

// JSON.parse only proves the metadata is JSON; this checks it has the fields
// the rest of the route dereferences. A new document needs case_id; a new
// version of an existing one needs document_id instead.
function isValidMetadataShape(m: Record<string, unknown>): boolean {
  const hasDocumentId = typeof m.document_id === "string" && m.document_id !== "";
  return (
    isPositiveInt(m.grid_size) &&
    isPositiveInt(m.page_count) &&
    typeof m.client_hash === "string" &&
    typeof m.merkle_root === "string" &&
    typeof m.commitment === "string" &&
    Array.isArray(m.salts) &&
    Array.isArray(m.tiles) &&
    Array.isArray(m.pages) &&
    (hasDocumentId || typeof m.case_id === "string")
  );
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

  // Fail before doing any work if salts can't be stored: a v2 version
  // whose salts are lost can never be verified (ADR-018).
  let saltKey: SaltKey;
  try {
    saltKey = saltKeyFromEnv();
  } catch (err) {
    console.error("[upload] salt encryption key unavailable:", err);
    return Response.json(
      { error: "SERVER_MISCONFIGURED", message: "Uploads are disabled: the salt encryption key is not configured." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "BAD_REQUEST", message: "Expected multipart/form-data." }, { status: 400 });
  }
  const metadataRaw = form.get("metadata");
  if (typeof metadataRaw !== "string") {
    return Response.json({ error: "BAD_REQUEST", message: "Missing metadata part." }, { status: 400 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataRaw);
  } catch {
    return Response.json({ error: "Invalid metadata" }, { status: 400 });
  }
  if (parsed === null) {
    return Response.json({ error: "BAD_REQUEST", message: "Missing metadata part." }, { status: 400 });
  }
  if (typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>).proof_version !== PROOF_V2) {
    // ADR-021: no new v1 (unsalted) versions.
    return Response.json(
      { error: "BAD_REQUEST", message: `Unsupported proof_version; uploads must use proof_version ${PROOF_V2}.` },
      { status: 400 }
    );
  }
  if (typeof parsed !== "object" || Array.isArray(parsed) || !isValidMetadataShape(parsed as Record<string, unknown>)) {
    return Response.json({ error: "BAD_REQUEST", message: "Invalid metadata shape." }, { status: 400 });
  }
  const metadata = parsed as UploadMetadata;

  if (metadata.tiles.length !== metadata.page_count * metadata.grid_size ** 2) {
    return Response.json(
      { error: "BAD_REQUEST", message: "tiles.length must equal page_count * grid_size^2." },
      { status: 400 }
    );
  }
  const parsedSalts = parseUploadSalts(metadata.salts, metadata.tiles.length);
  if ("error" in parsedSalts) {
    return Response.json({ error: "BAD_REQUEST", message: parsedSalts.error }, { status: 400 });
  }
  const { salts } = parsedSalts;

  const pageBuffers: Buffer[] = [];
  for (let i = 0; i < metadata.page_count; i++) {
    const file = form.get(`page_${i}`);
    if (!(file instanceof File)) {
      return Response.json(
        { error: "BAD_REQUEST", message: `Missing binary part page_${i}.` },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return Response.json({ error: "BAD_REQUEST", message: "Page file is empty." }, { status: 400 });
    }
    pageBuffers.push(buffer);
  }

  // --- Server-side hash re-verification (CLAUDE.md rule 4) ---
  // Never trust the submitted hashes: recompute the leaves, R and C from
  // the PNG bytes actually received, with the submitted salts, and compare.
  const serverComputed = await recomputeDocumentHashesV2(pageBuffers, metadata.grid_size, salts);

  if (
    serverComputed.fileHash !== metadata.client_hash ||
    serverComputed.documentRoot !== metadata.merkle_root ||
    serverComputed.commitment !== metadata.commitment
  ) {
    const submittedByIndex = new Map(metadata.tiles.map((t) => [t.tile_index, t.hash]));
    const mismatchedTileIndices = serverComputed.tiles
      .filter((t) => submittedByIndex.get(t.index) !== t.hashHex)
      .map((t) => t.index);

    return Response.json(
      {
        error: "HASH_MISMATCH",
        message: "Server-recomputed client_hash/merkle_root/commitment does not match submitted values.",
        mismatched_tile_indices: mismatchedTileIndices,
      },
      { status: 409 }
    );
  }

  let documentId = metadata.document_id ?? null;
  let caseId: string;
  let versionNo = 1;
  let previousHash: string | null = null;

  if (documentId) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      return Response.json({ error: "NOT_FOUND", message: "document_id does not exist." }, { status: 404 });
    }
    caseId = doc.caseId;
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
    try {
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
      caseId = created.caseId;
    } catch (err) {
      // uploaderId comes from a verified session, so the only foreign key
      // that can fail here is caseId.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return Response.json({ error: "NOT_FOUND", message: "Case not found." }, { status: 404 });
      }
      throw err;
    }
  }

  const timestamp = new Date();
  const chainHash = chainHashV2({ previousHash, commitment: serverComputed.commitment, versionNo, timestamp });

  const storagePrefix = `${documentId}/v${versionNo}`;
  for (let i = 0; i < pageBuffers.length; i++) {
    await putPagePng(`${storagePrefix}/page-${i}.png`, pageBuffers[i]);
  }
  const storageUri = `s3://${process.env.MINIO_BUCKET ?? "digivault-evidence"}/${storagePrefix}/`;

  // The version and its salts are written together, or not at all.
  let version = await prisma.$transaction(async (tx) => {
    const created = await tx.documentVersion.create({
      data: {
        documentId: documentId!,
        versionNo,
        proofVersion: PROOF_V2,
        merkleRoot: serverComputed.documentRoot,
        commitment: serverComputed.commitment,
        clientHash: serverComputed.fileHash,
        storageUri,
        previousHash,
        chainHash,
        gridSize: metadata.grid_size,
        uploadedById: actor.userId,
        status: "PROCESSING",
        timestamp,
      },
    });
    await storeVersionSalts(created.id, salts, saltKey, tx);
    return created;
  });

  await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } });
  await createVersionTiles(documentId, version.id, serverComputed.tiles);

  // Hashes verified, pages stored, tiles written: the version is READY.
  // Anchor state is tracked separately on AnchorLog, so an anchor failure
  // below never turns a valid upload into a FAILED one.
  version = await prisma.documentVersion.update({ where: { id: version.id }, data: { status: "READY" } });

  await writeAuditLog({
    actorId: actor.userId,
    action: "UPLOAD_DOCUMENT_VERSION",
    targetId: version.id,
    targetType: "DocumentVersion",
    sourceIp: sourceIpFromRequest(req),
  });

  // Auto-anchor (MinIO + Polygon) in the background; never fails the upload.
  anchorVersionInBackground(version.id, actor.userId, sourceIpFromRequest(req));

  // docs/02 step 10-11: send pages to ai-service for redaction targeting.
  // Real HTTP call to apps/ai-service (bilingual English + Hindi NER
  // redaction suggestions). Per
  // CLAUDE.md rule 2, a failure/timeout here must NEVER fail the upload —
  // the document is already fully hashed and stored above.
  try {
    // Names already confirmed elsewhere in this case (ADR-034); null = gazetteer off.
    const gazetteer = await caseGazetteer(caseId);
    const suggestions = await requestRedactionSuggestions(
      version.id,
      metadata.grid_size,
      metadata.pages.map((p, i) => ({
        pageIndex: p.page_index,
        widthPx: p.width_px,
        heightPx: p.height_px,
        pngBytes: pageBuffers[i],
      })),
      gazetteer
    );
    await persistSuggestionsAsFlags(version.id, suggestions);
  } catch (err) {
    console.error(`[upload] ai-service call failed for version ${version.id}, continuing without suggestions:`, err);
  }

  return Response.json(
    {
      document_id: documentId,
      document_version_id: version.id,
      version_no: versionNo,
      status: version.status,
      anchor_status: "PENDING",
      grid_size: metadata.grid_size,
      proof_version: PROOF_V2,
      merkle_root: serverComputed.documentRoot,
      commitment: serverComputed.commitment,
      client_hash: serverComputed.fileHash,
      storage_uri: storageUri,
      created_at: timestamp.toISOString(),
    },
    { status: 201 }
  );
}
