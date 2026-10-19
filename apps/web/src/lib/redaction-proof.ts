import type { DocumentVersion } from "@prisma/client";
import {
  checkRedaction,
  DEFAULT_MASK_COLOR,
  REDACTION_PROOF_FORMAT,
  redactionLocallyValid,
  sha256,
  toHex,
  type RedactionProof,
  type RedactionProofVersion,
} from "@digivault/crypto-core";
import { prisma } from "@/lib/prisma";
import { getPagePng } from "@/lib/storage";
import { decodePagePng } from "@/lib/server-hash";
import { getVersionTiles } from "@/lib/tiles-repo";
import { loadVersionSalts, revealableSalts } from "@/lib/tile-salts";
import { getLegacyAnchorDeployment } from "@/lib/contract-address";
import { PROOF_V2 } from "@/lib/proof-v2";

/**
 * Builds the redaction proof for a redacted version (docs/03 §Redaction
 * proofs, docs/07 Phase 3, ADR-029): the redacted page PNGs plus this file
 * let anyone show the copy is the ORIGINAL anchored document except for
 * the declared masked tiles.
 *
 *   original = the nearest earlier version that is not itself redacted
 *              (usually version 1). Redactions can be chained (v1 -> v2 ->
 *              v3); the masked set is then every tile masked in any of them.
 *   revealed = the original's salts for UNMASKED tiles only
 *              (tile-salts.ts: revealableSalts). A masked tile's original
 *              salt never leaves the server — that is what keeps its hidden
 *              pixels from being brute-forced from its leaf.
 *
 * Before it is returned, the proof is checked with the same code the portal
 * runs (crypto-core checkRedaction) against the stored redacted PNGs and the
 * recorded commitments; a proof that would not verify is never served.
 */

export type RedactionProofErrorCode = "NOT_REDACTED" | "NO_ORIGINAL" | "LEGACY_ORIGINAL" | "NOT_ANCHORED" | "INTEGRITY_ERROR";

export class RedactionProofError extends Error {
  constructor(
    public readonly code: RedactionProofErrorCode,
    message: string
  ) {
    super(message);
  }
}

const STATUS: Record<RedactionProofErrorCode, number> = {
  NOT_REDACTED: 400,
  NO_ORIGINAL: 409,
  LEGACY_ORIGINAL: 409,
  NOT_ANCHORED: 409,
  INTEGRITY_ERROR: 409,
};

export function redactionProofErrorResponse(err: RedactionProofError): Response {
  return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] });
}

async function anchorOf(version: DocumentVersion): Promise<RedactionProofVersion["anchor"]> {
  const log = await prisma.anchorLog.findFirst({
    where: { documentVersionId: version.id, polygonTxHash: { not: null } },
    orderBy: { anchoredAt: "desc" },
  });
  if (!log) {
    throw new RedactionProofError("NOT_ANCHORED", `Version ${version.versionNo} has not completed on-chain anchoring yet.`);
  }
  const legacy = getLegacyAnchorDeployment();
  return {
    chainId: legacy.chainId,
    contractAddress: log.contractAddress ?? legacy.address,
    txHash: log.polygonTxHash!,
    anchoredAt: log.anchoredAt.toISOString(),
  };
}

export interface BuiltRedactionProof {
  proof: RedactionProof;
  original: DocumentVersion;
  maskedCount: number;
}

export async function buildRedactionProof(version: DocumentVersion): Promise<BuiltRedactionProof> {
  if (!version.isRedacted || version.proofVersion !== PROOF_V2) {
    throw new RedactionProofError("NOT_REDACTED", "Redaction proofs exist only for redacted versions.");
  }
  const earlier = await prisma.documentVersion.findMany({
    where: { documentId: version.documentId, versionNo: { lt: version.versionNo } },
    orderBy: { versionNo: "desc" },
  });
  const originalIdx = earlier.findIndex((v) => !v.isRedacted);
  if (originalIdx < 0) throw new RedactionProofError("NO_ORIGINAL", "No unredacted original version precedes this one.");
  const original = earlier[originalIdx];
  if (original.proofVersion !== PROOF_V2 || !original.commitment) {
    throw new RedactionProofError(
      "LEGACY_ORIGINAL",
      "The original version uses the legacy v1 proof format (unsalted tiles), so a redaction proof against it would expose the masked tiles. Verify each version on its own instead."
    );
  }
  if (original.gridSize !== version.gridSize) {
    throw new RedactionProofError("INTEGRITY_ERROR", "The original and redacted versions use different grid sizes.");
  }
  // Versions after the original, up to and including this one: all redactions.
  const redactionSteps = [version.id, ...earlier.slice(0, originalIdx).map((v) => v.id)];

  const [originalAnchor, redactedAnchor] = [await anchorOf(original), await anchorOf(version)];

  const [originalTiles, redactedTiles] = [await getVersionTiles(original), await getVersionTiles(version)];
  const grid = version.gridSize;
  const perPage = grid * grid;
  const pageCount = redactedTiles.length / perPage;
  const contiguous = (tiles: { tileIndex: number }[]) => tiles.every((t, i) => t.tileIndex === i);
  if (!Number.isInteger(pageCount) || pageCount < 1 || originalTiles.length !== redactedTiles.length || !contiguous(originalTiles) || !contiguous(redactedTiles)) {
    throw new RedactionProofError("INTEGRITY_ERROR", "The original and redacted versions do not have the same pages.");
  }

  const [originalSalts, redactedSalts] = [await loadVersionSalts(original.id), await loadVersionSalts(version.id)];
  if (!originalSalts || !redactedSalts || originalSalts.length !== originalTiles.length || redactedSalts.length !== redactedTiles.length) {
    throw new RedactionProofError("INTEGRITY_ERROR", "A salt set is missing or the wrong size.");
  }

  const flags = await prisma.redactionFlag.findMany({
    where: { masked: true, tile: { documentVersionId: { in: redactionSteps } } },
    select: { tile: { select: { tileIndex: true } } },
  });
  const masked = [...new Set(flags.map((f) => f.tile.tileIndex))].sort((a, b) => a - b);
  if (masked.length === 0) throw new RedactionProofError("INTEGRITY_ERROR", "This redacted version records no masked tiles.");
  const revealed = revealableSalts(originalSalts, masked);

  const pngs: Buffer[] = [];
  const decoded = [];
  for (let i = 0; i < pageCount; i++) {
    const png = await getPagePng(`${version.documentId}/v${version.versionNo}/page-${i}.png`);
    pngs.push(png);
    const d = await decodePagePng(png, i);
    decoded.push({ pageIndex: i, width: d.width, height: d.height, rgba: new Uint8Array(d.pixels.buffer, d.pixels.byteOffset, d.pixels.byteLength) });
  }

  const describe = (v: DocumentVersion, anchor: RedactionProofVersion["anchor"]): RedactionProofVersion => ({
    versionId: v.id,
    versionNo: v.versionNo,
    commitment: v.commitment!,
    fileHash: v.clientHash,
    documentRoot: v.merkleRoot,
    anchor,
  });

  const proof: RedactionProof = {
    format: REDACTION_PROOF_FORMAT,
    gridSize: grid,
    maskColor: DEFAULT_MASK_COLOR,
    original: describe(original, originalAnchor),
    redacted: describe(version, redactedAnchor),
    pages: await Promise.all(
      decoded.map(async (d, i) => {
        const lo = i * perPage;
        const hi = lo + perPage;
        return {
          page: i,
          width: d.width,
          height: d.height,
          pngSha256: toHex(await sha256(pngs[i])),
          masked: masked.filter((g) => g >= lo && g < hi).map((g) => g - lo),
          originalLeaves: originalTiles.slice(lo, hi).map((t) => t.tileHash),
          revealedSalts: revealed.filter((s) => s.k >= lo && s.k < hi).map((s) => ({ k: s.k - lo, salt: s.salt })),
          redactedSalts: redactedSalts.slice(lo, hi).map((s) => s.toString("hex")),
        };
      })
    ),
  };

  const check = await checkRedaction(proof, decoded, pngs.map((b) => new Uint8Array(b)));
  if (!redactionLocallyValid(proof, check)) {
    const problems = check.pages.flatMap((p) => [
      ...p.changedTiles.map((k) => `page ${p.page + 1} tile ${k} differs from the original but is not masked`),
      ...p.maskViolations.map((k) => `page ${p.page + 1} tile ${k} is declared masked but is not solid mask colour`),
    ]);
    if (check.originalCommitment !== proof.original.commitment) problems.push("the original commitment does not recompute");
    if (check.redactedCommitment !== proof.redacted.commitment) problems.push("the redacted commitment does not recompute");
    throw new RedactionProofError("INTEGRITY_ERROR", `The redaction proof does not verify: ${problems.slice(0, 5).join("; ")}.`);
  }

  return { proof, original, maskedCount: masked.length };
}
