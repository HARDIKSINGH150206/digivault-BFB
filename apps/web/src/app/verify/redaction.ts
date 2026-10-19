import {
  checkRedaction,
  sha256,
  toHex,
  type RedactionCheck,
  type RedactionProof,
  type RgbaPage,
} from "@digivault/crypto-core";
import { byFilename, decodeRgba } from "./proof-v2";

/**
 * Browser side of redaction-proof verification (docs/03 §Redaction proofs).
 * Pure computation on the dropped files — no network, no backend (CLAUDE.md
 * rule 5). The caller then compares both recomputed commitments with the
 * official contracts.
 */

export interface RedactionRecompute {
  check: RedactionCheck;
  /** The dropped files in page order. */
  orderedFiles: File[];
  orderedByHash: boolean;
}

export async function recomputeRedaction(proof: RedactionProof, files: File[]): Promise<RedactionRecompute> {
  if (files.length !== proof.pages.length) {
    throw new Error(`The redaction proof covers ${proof.pages.length} page(s), but ${files.length} image(s) were supplied.`);
  }
  const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
  const hashes = await Promise.all(buffers.map(async (b) => toHex(await sha256(b))));
  // Place each file at the page whose PNG hash it matches; otherwise fall
  // back to filename order so a changed tile can still be named.
  const placed = proof.pages.map((p) => hashes.indexOf(p.pngSha256));
  const orderedByHash = placed.every((i) => i >= 0) && new Set(placed).size === files.length;
  const order = orderedByHash ? placed : files.map((_, i) => i).sort((a, b) => byFilename(files[a], files[b]));

  const pages: RgbaPage[] = [];
  for (let pageIndex = 0; pageIndex < order.length; pageIndex++) {
    const { width, height, rgba } = await decodeRgba(buffers[order[pageIndex]]);
    pages.push({ pageIndex, width, height, rgba });
  }
  const check = await checkRedaction(proof, pages, order.map((i) => new Uint8Array(buffers[i])));
  return { check, orderedFiles: order.map((i) => files[i]), orderedByHash };
}

function tileName(proof: RedactionProof, page: number, k: number): string {
  return `page ${page + 1} row ${Math.floor(k / proof.gridSize) + 1} col ${(k % proof.gridSize) + 1}`;
}

function list(names: string[]): string {
  return names.length > 6 ? `${names.slice(0, 6).join("; ")} and ${names.length - 6} more` : names.join("; ");
}

/** The most specific local problem, or null when everything recomputes. */
export function describeRedactionProblem(proof: RedactionProof, r: RedactionRecompute): string | null {
  const { check } = r;
  const sized = check.pages.filter((p) => p.sizeMismatch);
  if (sized.length) return `Page ${sized[0].page + 1} is not the size stated in the redaction proof (wrong file or page order).`;
  const violations = check.pages.flatMap((p) => p.maskViolations.map((k) => tileName(proof, p.page, k)));
  if (violations.length) return `${violations.length} masked tile(s) show something other than the solid mask colour: ${list(violations)}.`;
  const changed = check.pages.flatMap((p) => p.changedTiles.map((k) => tileName(proof, p.page, k)));
  if (changed.length) return `${changed.length} unmasked tile(s) differ from the original: ${list(changed)}.`;
  if (check.originalCommitment !== proof.original.commitment) {
    return "The masked tiles' recorded hashes do not rebuild the original's commitment (the proof file was altered).";
  }
  if (check.redactedCommitment !== proof.redacted.commitment) {
    return check.redactedDocumentRoot === proof.redacted.documentRoot
      ? "The page pixels match, but the image files are not the redacted originals (re-saved or re-encoded PNGs)."
      : "The page images do not hash to the redacted version's own commitment.";
  }
  return null;
}
