import { createHmac } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Case gazetteer (docs/07 Phase 6, ADR-034): a name an officer confirms for
 * redaction in one document of a case is flagged in the case's other
 * documents.
 *
 * - Nothing here ever holds a name. The AI service, which reads the page text
 *   anyway, returns HMAC-SHA256(case key, normalised name) on each name
 *   suggestion; confirming a tile stores those hashes in CaseGazetteerEntry
 *   (insert-only for the app role).
 * - Case key = HMAC-SHA256(GAZETTEER_KEY, "digivault/gazetteer/v1/case|" +
 *   caseId), so the same name hashes differently in every case and entries
 *   can't be linked across cases. It is sent to the AI service per request,
 *   never stored.
 * - GAZETTEER_KEY (base64, 32 bytes; `openssl rand -base64 32`) is separate
 *   from SALT_ENCRYPTION_KEY and identified by GAZETTEER_KEY_ID (default
 *   "g1"). Entries made under another key id are ignored, not deleted.
 * - Unset or invalid key: the gazetteer is off. Uploads and redactions carry
 *   on without it (CLAUDE.md rule 2: suggestions never block the pipeline).
 * - Cross-language test vectors: apps/ai-service/tests/gazetteer_vectors.json.
 */

const CASE_KEY_PREFIX = "digivault/gazetteer/v1/case|";

export interface GazetteerKey {
  id: string;
  key: Buffer;
}

/** The ai-service request field: one case's key and its known name hashes. */
export interface CaseGazetteer {
  case_key: string;
  name_hashes: string[];
}

export function gazetteerKeyFromEnv(env: Record<string, string | undefined> = process.env): GazetteerKey | null {
  const raw = env.GAZETTEER_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    console.error("[gazetteer] GAZETTEER_KEY must decode to exactly 32 bytes; case gazetteer is off.");
    return null;
  }
  return { id: env.GAZETTEER_KEY_ID || "g1", key };
}

export function deriveCaseKey(master: Buffer, caseId: string): Buffer {
  return createHmac("sha256", master).update(CASE_KEY_PREFIX + caseId, "utf8").digest();
}

/** What upload sends the AI service for this case, or null when the gazetteer is off. */
export async function caseGazetteer(caseId: string, gk: GazetteerKey | null = gazetteerKeyFromEnv()): Promise<CaseGazetteer | null> {
  if (!gk) return null;
  const entries = await prisma.caseGazetteerEntry.findMany({
    where: { caseId, keyId: gk.id },
    select: { nameHash: true },
  });
  return { case_key: deriveCaseKey(gk.key, caseId).toString("base64"), name_hashes: entries.map((e) => e.nameHash) };
}

/**
 * Adds the names on the tiles an officer just confirmed to the case
 * gazetteer. Returns how many were new. Never throws: a failure here must not
 * undo a redaction that is already stored.
 */
export async function addConfirmedNames(params: {
  caseId: string;
  priorVersionId: string;
  newVersionId: string;
  confirmedTileIds: string[];
  actorId: string;
  gk?: GazetteerKey | null;
}): Promise<number> {
  const gk = params.gk === undefined ? gazetteerKeyFromEnv() : params.gk;
  if (!gk || params.confirmedTileIds.length === 0) return 0;
  try {
    const flags = await prisma.redactionFlag.findMany({
      where: { tileId: { in: params.confirmedTileIds }, NOT: { nameHashes: { isEmpty: true } } },
      select: { nameHashes: true },
    });
    const hashes = [...new Set(flags.flatMap((f) => f.nameHashes))];
    if (hashes.length === 0) return 0;
    const { count } = await prisma.caseGazetteerEntry.createMany({
      data: hashes.map((nameHash) => ({
        caseId: params.caseId,
        nameHash,
        keyId: gk.id,
        sourceVersionId: params.newVersionId,
        createdById: params.actorId,
      })),
      skipDuplicates: true,
    });
    return count;
  } catch (err) {
    console.error(`[gazetteer] could not add names from version ${params.priorVersionId}:`, err);
    return 0;
  }
}
