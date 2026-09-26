import { loadPdf, renderPageToPng } from "./render";
import { hashTiles } from "./tiles";
import { buildMerkleTree } from "./merkle";
import { sha256, toHex, lengthPrefixedConcat } from "./hash";
import type { DocumentHashResult, PageRaster, TileHash } from "./types";

export const DEFAULT_GRID_SIZE = 20;

export interface HashDocumentOptions {
  gridSize?: number;
  /** Render scale passed to pdf.js viewport — higher = closer to a real scan DPI. */
  scale?: number;
}

/**
 * Full crypto-core pipeline: PDF -> per-page PNG raster -> tile pixel
 * hashes -> single Merkle tree/root for the whole document version.
 * Steps 2-6 of docs/02-architecture-and-dataflow.md. Never touches OCR/AI
 * output (CLAUDE.md rule 2) — this function's only inputs are PDF bytes.
 */
export async function hashDocument(
  pdfBytes: ArrayBuffer,
  opts: HashDocumentOptions = {}
): Promise<DocumentHashResult & { pagePngBytes: Uint8Array[] }> {
  const gridSize = opts.gridSize ?? DEFAULT_GRID_SIZE;
  const scale = opts.scale ?? 2.0;

  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.numPages;

  const pages: PageRaster[] = [];
  const allTiles: TileHash[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const { raster, canvas } = await renderPageToPng(pdf, pageIndex, scale);
    pages.push(raster);

    const tiles = await hashTiles(
      canvas,
      pageIndex,
      gridSize,
      pageIndex * gridSize * gridSize
    );
    allTiles.push(...tiles);
  }

  const clientHashBytes = await sha256(
    lengthPrefixedConcat(pages.map((p) => p.pngBytes))
  );

  const { rootHex } = buildMerkleTree(allTiles);

  return {
    gridSize,
    pageCount,
    clientHash: toHex(clientHashBytes),
    merkleRoot: rootHex,
    tiles: allTiles,
    pages: pages.map(({ pageIndex, widthPx, heightPx }) => ({ pageIndex, widthPx, heightPx })),
    pagePngBytes: pages.map((p) => p.pngBytes),
  };
}
