import { toHex } from "./hash";
import { merkleTreeHash } from "./merkle-v2";
import {
  commitmentV2,
  documentRootV2,
  extractTileRgba,
  fileHashOfPngs,
  fromHex,
  hashPageV2,
  leafHashV2,
  tileRects,
  type RgbaPage,
} from "./dv2";

/**
 * Redaction proofs (docs/03 §Redaction proofs, docs/07 Phase 3, ADR-029).
 *
 * A redacted copy is a set of lossless page PNGs at the original render
 * scale, with every masked tile filled with one solid `maskColor`
 * (ADR-023). A redaction proof lets anyone show, from those PNGs alone,
 * that the copy is the ORIGINAL anchored document except for the declared
 * masked tiles:
 *
 *   1. every unmasked tile's original leaf is recomputed from the redacted
 *      PNG's pixels with the original's salt (revealed for unmasked tiles
 *      only) — so its pixels are the original's, byte for byte;
 *   2. every masked tile must be solid maskColor in the PNG — otherwise a
 *      "masked" tile could show fabricated content;
 *   3. masked tiles' original leaves are taken as given: they are salted,
 *      and their salts are never revealed, so the hidden pixels can't be
 *      brute-forced from them;
 *   4. page roots -> R -> C = H(0x03 ‖ original fileHash ‖ R) must equal
 *      the original version's anchor on chain (the caller checks that);
 *   5. the redacted version's own C is recomputed from the same PNGs with
 *      its own salts, and must equal its own anchor.
 *
 * This module is pure computation and is shared by the server (which
 * self-checks every proof before serving it) and the Court Verification
 * Portal. Chain lookups are the caller's job.
 */

export const REDACTION_PROOF_FORMAT = "digivault-redaction-proof/1";
/** Opaque black, the fill used by the redaction step (lib/server-hash.ts: redactPagePng). */
export const DEFAULT_MASK_COLOR: [number, number, number, number] = [0, 0, 0, 255];

export interface RedactionProofAnchor {
  chainId: number;
  contractAddress: string;
  txHash: string;
  anchoredAt: string;
}

export interface RedactionProofVersion {
  versionId: string;
  versionNo: number;
  commitment: string;
  fileHash: string;
  documentRoot: string;
  anchor: RedactionProofAnchor;
}

export interface RedactionProofPage {
  page: number;
  width: number;
  height: number;
  /** SHA-256 of the redacted page PNG; used to put dropped files in page order. */
  pngSha256: string;
  /** Masked tile indices k (row·grid + col, within the page), ascending. */
  masked: number[];
  /**
   * The ORIGINAL version's leaves, all grid² of them in k order. Masked
   * entries are inputs (taken as given); unmasked entries are only used to
   * name a tile that does not match — they are always recomputed.
   */
  originalLeaves: string[];
  /** The ORIGINAL version's salts for the unmasked tiles only, ascending k. */
  revealedSalts: { k: number; salt: string }[];
  /** The redacted version's own salts, all grid² of them in k order. */
  redactedSalts: string[];
}

export interface RedactionProof {
  format: typeof REDACTION_PROOF_FORMAT;
  gridSize: number;
  maskColor: [number, number, number, number];
  original: RedactionProofVersion;
  redacted: RedactionProofVersion;
  pages: RedactionProofPage[];
}

const HEX32 = /^[0-9a-f]{64}$/;

function invalidVersion(v: RedactionProofVersion | undefined, name: string): string | null {
  if (!v || typeof v !== "object") return `missing ${name}`;
  if (typeof v.versionId !== "string" || !v.versionId) return `missing ${name}.versionId`;
  if (!Number.isInteger(v.versionNo) || v.versionNo < 1) return `invalid ${name}.versionNo`;
  for (const k of ["commitment", "fileHash", "documentRoot"] as const) {
    if (typeof v[k] !== "string" || !HEX32.test(v[k])) return `invalid ${name}.${k}`;
  }
  if (!v.anchor || typeof v.anchor.contractAddress !== "string" || typeof v.anchor.txHash !== "string") return `missing ${name}.anchor`;
  return null;
}

/** Shape check; returns a reason string if the file is not a usable redaction proof. */
export function invalidRedactionProof(p: RedactionProof): string | null {
  if (!p || p.format !== REDACTION_PROOF_FORMAT) return "not a redaction proof";
  if (!Number.isInteger(p.gridSize) || p.gridSize < 1 || p.gridSize > 64) return "invalid gridSize";
  if (!Array.isArray(p.maskColor) || p.maskColor.length !== 4 || !p.maskColor.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
    return "invalid maskColor";
  }
  const v = invalidVersion(p.original, "original") ?? invalidVersion(p.redacted, "redacted");
  if (v) return v;
  if (p.original.versionId === p.redacted.versionId) return "original and redacted are the same version";
  if (!Array.isArray(p.pages) || p.pages.length < 1) return "no pages";
  const perPage = p.gridSize * p.gridSize;
  for (let i = 0; i < p.pages.length; i++) {
    const pg = p.pages[i];
    if (pg.page !== i) return `pages[${i}] is out of order`;
    if (!Number.isInteger(pg.width) || !Number.isInteger(pg.height) || pg.width < 1 || pg.height < 1) return `page ${i}: invalid size`;
    if (!HEX32.test(pg.pngSha256 ?? "")) return `page ${i}: invalid pngSha256`;
    if (!Array.isArray(pg.masked) || pg.masked.some((k, j) => !Number.isInteger(k) || k < 0 || k >= perPage || (j > 0 && k <= pg.masked[j - 1]))) {
      return `page ${i}: masked must be ascending, distinct tile indices`;
    }
    if (!Array.isArray(pg.originalLeaves) || pg.originalLeaves.length !== perPage || !pg.originalLeaves.every((l) => HEX32.test(l))) {
      return `page ${i}: originalLeaves must hold ${perPage} hashes`;
    }
    if (!Array.isArray(pg.redactedSalts) || pg.redactedSalts.length !== perPage || !pg.redactedSalts.every((s) => HEX32.test(s))) {
      return `page ${i}: redactedSalts must hold ${perPage} salts`;
    }
    // Exactly one revealed salt per unmasked tile, none for a masked one.
    const masked = new Set(pg.masked);
    const unmasked = Array.from({ length: perPage }, (_, k) => k).filter((k) => !masked.has(k));
    if (!Array.isArray(pg.revealedSalts) || pg.revealedSalts.length !== unmasked.length) {
      return `page ${i}: revealedSalts must cover exactly the unmasked tiles`;
    }
    for (let j = 0; j < unmasked.length; j++) {
      const s = pg.revealedSalts[j];
      if (!s || s.k !== unmasked[j] || !HEX32.test(s.salt ?? "")) return `page ${i}: revealedSalts must cover exactly the unmasked tiles`;
    }
  }
  return null;
}

export interface RedactionPageCheck {
  page: number;
  tileCount: number;
  maskedCount: number;
  /** Unmasked tiles whose recomputed original leaf differs from the proof's (k). */
  changedTiles: number[];
  /** Masked tiles whose pixels are not all maskColor (k). */
  maskViolations: number[];
  /** True when the decoded PNG's size is not the size in the proof. */
  sizeMismatch: boolean;
}

export interface RedactionCheck {
  /** C recomputed for the ORIGINAL version (compare with its on-chain anchor). */
  originalCommitment: string;
  originalDocumentRoot: string;
  /** C recomputed for the REDACTED version from the same PNGs and its own salts. */
  redactedCommitment: string;
  redactedDocumentRoot: string;
  redactedFileHash: string;
  pages: RedactionPageCheck[];
}

function isSolid(pixels: Uint8Array, color: readonly number[]): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] !== color[0] || pixels[i + 1] !== color[1] || pixels[i + 2] !== color[2] || pixels[i + 3] !== color[3]) return false;
  }
  return true;
}

/**
 * Recomputes both commitments from the redacted pages (decoded RGBA, in
 * page order, with their PNG bytes). Call invalidRedactionProof first.
 * Holds one page of RGBA at a time if the caller passes them lazily.
 */
export async function checkRedaction(
  proof: RedactionProof,
  pages: RgbaPage[],
  pngs: Uint8Array[]
): Promise<RedactionCheck> {
  if (pages.length !== proof.pages.length || pngs.length !== proof.pages.length) {
    throw new Error(`The proof covers ${proof.pages.length} page(s), but ${pages.length} were supplied.`);
  }
  const grid = proof.gridSize;
  const originalRoots: Uint8Array[] = [];
  const redactedRoots: Uint8Array[] = [];
  const results: RedactionPageCheck[] = [];

  for (let i = 0; i < proof.pages.length; i++) {
    const pp = proof.pages[i];
    const page: RgbaPage = { ...pages[i], pageIndex: i };
    const rects = tileRects(page.width, page.height, grid);
    const masked = new Set(pp.masked);
    const saltByK = new Map(pp.revealedSalts.map((s) => [s.k, fromHex(s.salt, 32)]));

    const leaves: Uint8Array[] = [];
    const changedTiles: number[] = [];
    const maskViolations: number[] = [];
    for (let k = 0; k < rects.length; k++) {
      const rect = rects[k];
      const pixels = extractTileRgba(page, rect);
      if (masked.has(k)) {
        if (!isSolid(pixels, proof.maskColor)) maskViolations.push(k);
        leaves.push(fromHex(pp.originalLeaves[k], 32));
      } else {
        const leaf = await leafHashV2(saltByK.get(k)!, i, k, rect.w, rect.h, pixels);
        if (toHex(leaf) !== pp.originalLeaves[k]) changedTiles.push(k);
        leaves.push(leaf);
      }
    }
    originalRoots.push(merkleTreeHash(leaves));

    const own = await hashPageV2(page, grid, pp.redactedSalts.map((s) => fromHex(s, 32)));
    redactedRoots.push(own.pageRoot);

    results.push({
      page: i,
      tileCount: rects.length,
      maskedCount: masked.size,
      changedTiles,
      maskViolations,
      sizeMismatch: page.width !== pp.width || page.height !== pp.height,
    });
  }

  const originalDocumentRoot = documentRootV2(originalRoots);
  const redactedDocumentRoot = documentRootV2(redactedRoots);
  const redactedFileHash = await fileHashOfPngs(pngs);
  return {
    originalCommitment: toHex(commitmentV2(fromHex(proof.original.fileHash, 32), originalDocumentRoot)),
    originalDocumentRoot: toHex(originalDocumentRoot),
    redactedCommitment: toHex(commitmentV2(redactedFileHash, redactedDocumentRoot)),
    redactedDocumentRoot: toHex(redactedDocumentRoot),
    redactedFileHash: toHex(redactedFileHash),
    pages: results,
  };
}

/**
 * Everything that must hold locally for a redaction proof, before the chain
 * is consulted: no changed tile, no masked tile showing content, sizes as
 * stated, and both recomputed commitments equal to the ones in the proof.
 */
export function redactionLocallyValid(proof: RedactionProof, check: RedactionCheck): boolean {
  return (
    check.pages.every((p) => p.changedTiles.length === 0 && p.maskViolations.length === 0 && !p.sizeMismatch) &&
    check.originalCommitment === proof.original.commitment &&
    check.redactedCommitment === proof.redacted.commitment
  );
}
