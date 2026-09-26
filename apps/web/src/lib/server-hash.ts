import sharp from "sharp";
import { sha256, toHex, buildMerkleTree, lengthPrefixedConcat, type TileHash } from "@digivault/crypto-core";

/**
 * Server-side hash re-verification (CLAUDE.md rule 4 / docs/04-api-spec.md
 * "the rule that governs every endpoint"). The server never trusts a
 * client-submitted client_hash/merkle_root — it decodes the PNG bytes it
 * actually received and recomputes both independently, using the exact
 * same algorithm as packages/crypto-core (raw-pixel-per-tile SHA-256 ->
 * Merkle tree, sortPairs:false, page-major/row-major leaf order — see
 * docs/03-crypto-and-merkle-spec.md). Only the pixel-extraction step
 * differs by necessity: the browser reads canvas ImageData, Node has no
 * DOM canvas, so this uses `sharp` to decode the PNG to a raw RGBA buffer
 * instead. Hashing/Merkle logic itself is imported directly from
 * @digivault/crypto-core, not reimplemented.
 */

interface DecodedPage {
  pageIndex: number;
  width: number;
  height: number;
  /** Raw RGBA pixels, row-major, top-to-bottom — same layout as canvas ImageData. */
  pixels: Buffer;
}

async function decodePagePng(pngBytes: Buffer, pageIndex: number): Promise<DecodedPage> {
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

/** Recomputes client_hash + merkle_root + every tile hash from PNG bytes actually received. */
export async function recomputeDocumentHashes(
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

/** Re-renders a page's PNG with opaque black rectangles over the given tile regions (redaction). */
export async function redactPagePng(
  pngBytes: Buffer,
  gridSize: number,
  tilesToMask: { row: number; col: number }[]
): Promise<Buffer> {
  const metadata = await sharp(pngBytes).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const tileW = Math.ceil(width / gridSize);
  const tileH = Math.ceil(height / gridSize);

  const rects = tilesToMask
    .map(({ row, col }) => {
      const x = col * tileW;
      const y = row * tileH;
      const w = Math.min(tileW, width - x);
      const h = Math.min(tileH, height - y);
      if (w <= 0 || h <= 0) return "";
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
    })
    .join("");

  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
  );

  return sharp(pngBytes)
    .composite([{ input: overlaySvg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
