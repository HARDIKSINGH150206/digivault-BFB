import sharp from "sharp";
import {
  sha256,
  toHex,
  buildMerkleTree,
  lengthPrefixedConcat,
  assembleDocumentV2,
  fileHashOfPngs,
  hashPageV2,
  tileRects,
  DEFAULT_MASK_COLOR,
  type DocumentHashV2,
  type PageHashV2,
  type TileHash,
} from "@digivault/crypto-core";

/**
 * Server-side hash re-verification (CLAUDE.md rule 4 / docs/04-api-spec.md
 * "the rule that governs every endpoint"). The server never trusts a
 * client-submitted hash — it decodes the PNG bytes it actually received and
 * recomputes everything independently. Only the pixel-extraction step
 * differs by necessity: the browser reads canvas ImageData, Node has no DOM
 * canvas, so this uses `sharp` to decode the PNG to a raw RGBA buffer
 * instead (same layout). Hashing/Merkle logic is imported from
 * @digivault/crypto-core, not reimplemented:
 *   - v2 (all new versions): salted leaves, RFC 6962 trees, commitment C
 *     (recomputeDocumentHashesV2, docs/03 §v2).
 *   - v1 (legacy, read-only): unsalted leaves, merkletreejs
 *     (recomputeDocumentHashesV1, only to rebuild old versions' tile rows).
 */

interface DecodedPage {
  pageIndex: number;
  width: number;
  height: number;
  /** Raw RGBA pixels, row-major, top-to-bottom — same layout as canvas ImageData. */
  pixels: Buffer;
}

export async function decodePagePng(pngBytes: Buffer, pageIndex: number): Promise<DecodedPage> {
  const { data, info } = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels (RGBA) after ensureAlpha(), got ${info.channels}`);
  }
  return { pageIndex, width: info.width, height: info.height, pixels: data };
}

function extractTilePixels(page: DecodedPage, x: number, y: number, w: number, h: number): Uint8Array {
  const channels = 4;
  const out = new Uint8Array(w * h * channels);
  const srcStride = page.width * channels;
  const dstStride = w * channels;
  for (let row = 0; row < h; row++) {
    const srcOffset = (y + row) * srcStride + x * channels;
    page.pixels.copy(out, row * dstStride, srcOffset, srcOffset + dstStride);
  }
  return out;
}

async function hashTilesServer(
  page: DecodedPage,
  gridSize: number,
  globalIndexOffset: number
): Promise<TileHash[]> {
  const { width, height, pageIndex } = page;
  const tileW = Math.ceil(width / gridSize);
  const tileH = Math.ceil(height / gridSize);
  const results: TileHash[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * tileW;
      const y = row * tileH;
      const w = Math.min(tileW, width - x);
      const h = Math.min(tileH, height - y);

      const pixels = w > 0 && h > 0 ? extractTilePixels(page, x, y, w, h) : new Uint8Array(0);
      const hashBytes = await sha256(pixels);

      results.push({
        index: globalIndexOffset + row * gridSize + col,
        pageIndex,
        row,
        col,
        hashHex: toHex(hashBytes),
      });
    }
  }
  return results;
}

export interface ServerHashResult {
  gridSize: number;
  pageCount: number;
  clientHash: string;
  merkleRoot: string;
  tiles: TileHash[];
}

/**
 * LEGACY v1 (unsalted) recomputation. Only used to rebuild tile rows of
 * pre-v2 versions (lib/tiles-repo.ts); new versions are v2.
 * Recomputes client_hash + merkle_root + every tile hash from PNG bytes actually received.
 */
export async function recomputeDocumentHashesV1(
  pagePngBuffers: Buffer[],
  gridSize: number
): Promise<ServerHashResult> {
  const allTiles: TileHash[] = [];

  for (let pageIndex = 0; pageIndex < pagePngBuffers.length; pageIndex++) {
    const decoded = await decodePagePng(pagePngBuffers[pageIndex], pageIndex);
    const tiles = await hashTilesServer(decoded, gridSize, pageIndex * gridSize * gridSize);
    allTiles.push(...tiles);
  }

  const clientHashBytes = await sha256(
    lengthPrefixedConcat(pagePngBuffers.map((b) => new Uint8Array(b)))
  );
  const { rootHex } = buildMerkleTree(allTiles);

  return {
    gridSize,
    pageCount: pagePngBuffers.length,
    clientHash: toHex(clientHashBytes),
    merkleRoot: rootHex,
    tiles: allTiles,
  };
}

/**
 * v2 recomputation (docs/03 §v2): decodes each received PNG with sharp and
 * runs the same @digivault/crypto-core v2 code the browser ran on its
 * canvas pixels, with the given salts (pageCount·gridSize² of them, global
 * tile order). One page of RGBA is held at a time.
 */
export async function recomputeDocumentHashesV2(
  pagePngBuffers: Buffer[],
  gridSize: number,
  salts: Uint8Array[]
): Promise<DocumentHashV2> {
  const perPage = gridSize * gridSize;
  if (salts.length !== pagePngBuffers.length * perPage) {
    throw new Error(`Expected ${pagePngBuffers.length * perPage} salts, got ${salts.length}.`);
  }
  const pages: PageHashV2[] = [];
  for (let pageIndex = 0; pageIndex < pagePngBuffers.length; pageIndex++) {
    const decoded = await decodePagePng(pagePngBuffers[pageIndex], pageIndex);
    pages.push(
      await hashPageV2(
        { pageIndex, width: decoded.width, height: decoded.height, rgba: new Uint8Array(decoded.pixels.buffer, decoded.pixels.byteOffset, decoded.pixels.byteLength) },
        gridSize,
        salts.slice(pageIndex * perPage, (pageIndex + 1) * perPage)
      )
    );
  }
  return assembleDocumentV2(gridSize, pages, await fileHashOfPngs(pagePngBuffers.map((b) => new Uint8Array(b))));
}

/**
 * Redacts a page: fills the given tiles with the solid mask colour
 * (opaque black, DEFAULT_MASK_COLOR) directly in the decoded RGBA and
 * re-encodes losslessly at the same size (ADR-023). Every other pixel is
 * copied unchanged, which is what lets a redaction proof show the copy is
 * the original except for the masked tiles (docs/03 §Redaction proofs). No
 * compositing: blending premultiplies alpha and could alter pixels that
 * aren't fully opaque.
 */
export async function redactPagePng(
  pngBytes: Buffer,
  gridSize: number,
  tilesToMask: { row: number; col: number }[]
): Promise<Buffer> {
  const page = await decodePagePng(pngBytes, 0);
  const rects = tileRects(page.width, page.height, gridSize);
  for (const { row, col } of tilesToMask) {
    const r = rects[row * gridSize + col];
    if (!r || r.row !== row || r.col !== col) throw new Error(`Tile R${row}C${col} is outside a ${gridSize}x${gridSize} grid.`);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) page.pixels.set(DEFAULT_MASK_COLOR, (y * page.width + x) * 4);
    }
  }
  return sharp(page.pixels, { raw: { width: page.width, height: page.height, channels: 4 } }).png().toBuffer();
}
