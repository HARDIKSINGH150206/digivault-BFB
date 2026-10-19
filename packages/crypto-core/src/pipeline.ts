import { loadPdf, renderPageToPng } from "./render";
import { hashTiles } from "./tiles";
import { buildMerkleTree } from "./merkle";
import { sha256, toHex, lengthPrefixedConcat } from "./hash";
import { assembleDocumentV2, fileHashOfPngs, generateSalts, hashPageV2, type DocumentHashV2, type PageHashV2 } from "./dv2";
import type { DocumentHashResult, PageRaster, TileHash } from "./types";

export const DEFAULT_GRID_SIZE = 20;

export interface HashDocumentOptions {
  gridSize?: number;
  /** Render scale passed to pdf.js viewport — higher = closer to a real scan DPI. */
  scale?: number;
}

/**
 * LEGACY v1 pipeline (unsalted leaves, merkletreejs). Kept for the PoC
 * harness only; uploads use hashDocumentV2 (ADR-021: no new v1 proofs).
 *
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

export interface DocumentHashV2Result extends DocumentHashV2 {
  /** Hex, one per tile in global tile order — sent with the upload, never shown. */
  salts: string[];
  pages: Pick<PageRaster, "pageIndex" | "widthPx" | "heightPx">[];
  pagePngBytes: Uint8Array[];
}

/**
 * v2 pipeline (docs/03 §v2): PDF -> per-page lossless PNG -> salted tile
 * leaves -> RFC 6962 page roots -> document root R -> commitment C. Salts
 * are generated here, in the browser, with the CSPRNG (ADR-018), so the
 * client still hashes first and the server re-verifies with the same salts
 * (CLAUDE.md rule 4). Only PDF bytes go in: no OCR/AI output (rule 2).
 */
export async function hashDocumentV2(pdfBytes: ArrayBuffer, opts: HashDocumentOptions = {}): Promise<DocumentHashV2Result> {
  const gridSize = opts.gridSize ?? DEFAULT_GRID_SIZE;
  const scale = opts.scale ?? 2.0;

  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.numPages;
  const perPage = gridSize * gridSize;
  const salts = generateSalts(pageCount * perPage);

  const pages: PageRaster[] = [];
  const hashed: PageHashV2[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const { raster, canvas } = await renderPageToPng(pdf, pageIndex, scale);
    pages.push(raster);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error("Could not acquire 2D canvas context for tiling");
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    hashed.push(
      await hashPageV2(
        { pageIndex, width: canvas.width, height: canvas.height, rgba },
        gridSize,
        salts.slice(pageIndex * perPage, (pageIndex + 1) * perPage)
      )
    );
  }

  const result = assembleDocumentV2(gridSize, hashed, await fileHashOfPngs(pages.map((p) => p.pngBytes)));
  return {
    ...result,
    salts: salts.map(toHex),
    pages: pages.map(({ pageIndex, widthPx, heightPx }) => ({ pageIndex, widthPx, heightPx })),
    pagePngBytes: pages.map((p) => p.pngBytes),
  };
}
