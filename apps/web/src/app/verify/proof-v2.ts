import {
  assembleDocumentV2,
  fileHashOfPngs,
  fromHex,
  hashPageV2,
  sha256,
  toHex,
  type PageHashV2,
} from "@digivault/crypto-core";

/**
 * Browser-side verifier for verification-proof.json v2 (docs/03 §v2,
 * docs/04 §5). Pure computation on the files the user supplied: no
 * network, no backend, no DB (CLAUDE.md rule 5). The caller compares the
 * recomputed commitment with the on-chain anchor — that is the only check
 * that decides VERIFIED; the proof's own leaves, page roots and hashes are
 * used only to say WHERE a mismatch is.
 */

export interface ProofFileV2 {
  digivault_proof_version: 2;
  document_version_id: string;
  is_redacted: boolean;
  grid_size: number;
  page_count: number;
  file_hash: string;
  document_root: string;
  commitment: string;
  pages: { page_index: number; width_px: number; height_px: number; png_sha256: string; page_root: string }[];
  tiles: { tile_index: number; leaf: string; salt: string }[];
  anchor: { polygon_chain_id: number; contract_address: string; polygon_tx_hash: string; anchored_at: string };
}

const HEX32 = /^[0-9a-f]{64}$/;

/** Shape check; returns a reason string if the file is not a usable v2 proof. */
export function invalidProofV2(p: ProofFileV2): string | null {
  if (typeof p.document_version_id !== "string" || !p.document_version_id) return "missing document_version_id";
  if (!Number.isInteger(p.grid_size) || p.grid_size < 1 || p.grid_size > 64) return "invalid grid_size";
  if (!Number.isInteger(p.page_count) || p.page_count < 1) return "invalid page_count";
  for (const k of ["file_hash", "document_root", "commitment"] as const) {
    if (typeof p[k] !== "string" || !HEX32.test(p[k])) return `invalid ${k}`;
  }
  if (!Array.isArray(p.pages) || p.pages.length !== p.page_count) return "pages[] does not match page_count";
  const perPage = p.grid_size * p.grid_size;
  if (!Array.isArray(p.tiles) || p.tiles.length !== p.page_count * perPage) return "tiles[] does not cover every tile";
  for (let i = 0; i < p.tiles.length; i++) {
    const t = p.tiles[i];
    if (t.tile_index !== i || !HEX32.test(t.salt ?? "") || !HEX32.test(t.leaf ?? "")) return `invalid tile entry ${i}`;
  }
  return null;
}

/** Natural order, so page-10.png sorts after page-9.png. */
export function byFilename(a: File, b: File): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

export async function decodeRgba(bytes: ArrayBuffer): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  // No colour-space conversion or premultiplication, so the pixels are the
  // PNG's own bytes — the same raw decode the server does with sharp.
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not acquire a 2D canvas context.");
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, rgba: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close();
  }
}

export interface V2Recompute {
  commitment: string;
  documentRoot: string;
  fileHash: string;
  /** Global tile indices whose recomputed leaf differs from the proof's. */
  mismatchedTiles: number[];
  /** Pages whose PNG bytes are not the ones in the proof (by SHA-256). */
  pagesNotMatchingPngHash: number[];
  /** True when files were placed by their SHA-256; false when by filename. */
  orderedByHash: boolean;
}

export async function recomputeV2(proof: ProofFileV2, files: File[]): Promise<V2Recompute> {
  if (files.length !== proof.page_count) {
    throw new Error(`The proof covers ${proof.page_count} page(s), but ${files.length} image(s) were supplied.`);
  }
  const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
  const hashes = await Promise.all(buffers.map(async (b) => toHex(await sha256(b))));

  // Put each file at the page whose PNG hash it matches. If any file
  // matches no page (edited, re-encoded or a wrong file), fall back to
  // filename order so the tile comparison can still point at the change.
  const byHash = new Map(proof.pages.map((p) => [p.png_sha256, p.page_index]));
  const placed = hashes.map((h) => byHash.get(h));
  const orderedByHash = placed.every((p) => p !== undefined) && new Set(placed).size === files.length;
  const order: number[] = orderedByHash
    ? proof.pages.map((p) => hashes.indexOf(p.png_sha256))
    : files.map((_, i) => i).sort((a, b) => byFilename(files[a], files[b]));

  const perPage = proof.grid_size * proof.grid_size;
  const pages: PageHashV2[] = [];
  const pagesNotMatchingPngHash: number[] = [];
  for (let pageIndex = 0; pageIndex < order.length; pageIndex++) {
    const fileIdx = order[pageIndex];
    if (hashes[fileIdx] !== proof.pages[pageIndex].png_sha256) pagesNotMatchingPngHash.push(pageIndex);
    const { width, height, rgba } = await decodeRgba(buffers[fileIdx]);
    const salts = proof.tiles.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((t) => fromHex(t.salt, 32));
    pages.push(await hashPageV2({ pageIndex, width, height, rgba }, proof.grid_size, salts));
  }

  const fileHash = await fileHashOfPngs(order.map((i) => new Uint8Array(buffers[i])));
  const doc = assembleDocumentV2(proof.grid_size, pages, fileHash);
  const mismatchedTiles = doc.tiles.filter((t) => t.hashHex !== proof.tiles[t.index].leaf).map((t) => t.index);
  return {
    commitment: doc.commitment,
    documentRoot: doc.documentRoot,
    fileHash: doc.fileHash,
    mismatchedTiles,
    pagesNotMatchingPngHash,
    orderedByHash,
  };
}

/** Human-readable reason for a local mismatch, most specific first. */
export function describeV2Mismatch(proof: ProofFileV2, r: V2Recompute): string {
  if (r.mismatchedTiles.length > 0) {
    const perPage = proof.grid_size * proof.grid_size;
    const shown = r.mismatchedTiles.slice(0, 8).map((i) => {
      const k = i % perPage;
      return `page ${Math.floor(i / perPage) + 1} row ${Math.floor(k / proof.grid_size) + 1} col ${(k % proof.grid_size) + 1}`;
    });
    const more = r.mismatchedTiles.length > 8 ? ` and ${r.mismatchedTiles.length - 8} more` : "";
    return `${r.mismatchedTiles.length} tile(s) differ from the proof: ${shown.join("; ")}${more}.`;
  }
  if (r.documentRoot === proof.document_root && r.fileHash !== proof.file_hash) {
    return "The page pixels match, but the image files are not the originals (re-saved or re-encoded PNGs).";
  }
  return "The supplied page image(s) do not hash to the commitment stated in the proof file.";
}
