import { sha256 as syncSha256 } from "js-sha256";
import { sha256, toHex, lengthPrefixedConcat } from "./hash";
import { merkleTreeHash } from "./merkle-v2";
import type { TileHash } from "./types";

/**
 * DigiVault proof format v2: salted tile leaves, RFC 6962 trees, and the
 * commitment C that is anchored (docs/03 §v2, docs/07 Phase 1, ADR-018).
 * All integers are unsigned big-endian; `‖` is concatenation; H = SHA-256.
 *
 *   leaf      = H(0x00 ‖ salt[32] ‖ "DV2" ‖ u32 page ‖ u32 k ‖ u32 w ‖ u32 h ‖ rgba[w·h·4])
 *               k = row·grid + col, the tile's index WITHIN its page
 *   pageRoot  = MTH(the page's leaves, row-major)                  (merkle-v2.ts)
 *   R         = H(0x02 ‖ u32 pageCount ‖ MTH(pageRoots))
 *   fileHash  = H(‖ u32 len ‖ png) over the page PNGs              (the client hash)
 *   C         = H(0x03 ‖ fileHash ‖ R)                             anchored on-chain
 *   chainHash = H(0x06 ‖ prev? ‖ C ‖ u32 versionNo ‖ u64 timestampMs)
 *
 * Domain-separation bytes used across DigiVault: 0x00 leaf, 0x01 inner
 * node, 0x02 document root, 0x03 commitment, 0x04 audit entry, 0x05 audit
 * legacy digest, 0x06 version chain hash.
 *
 * Pixels come in as a full page of RGBA bytes (row-major, top-to-bottom —
 * canvas ImageData in the browser, sharp's raw output on the server), so
 * this one implementation serves both sides.
 */

export const DV2_PROOF_VERSION = 2;
export const SALT_BYTES = 32;
const LEAF_TAG = new TextEncoder().encode("DV2");

export interface RgbaPage {
  pageIndex: number;
  width: number;
  height: number;
  /** width·height·4 bytes, RGBA, row-major. */
  rgba: Uint8Array | Uint8ClampedArray;
}

export interface TileRect {
  row: number;
  col: number;
  x: number;
  y: number;
  /** Clamped to 0 for the zero-area tiles that ceil() can leave on the last row/column. */
  w: number;
  h: number;
}

/** The grid used by every DigiVault version: ceil-sized tiles, the last row/column clipped. */
export function tileRects(width: number, height: number, gridSize: number): TileRect[] {
  const tileW = Math.ceil(width / gridSize);
  const tileH = Math.ceil(height / gridSize);
  const rects: TileRect[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * tileW;
      const y = row * tileH;
      rects.push({ row, col, x, y, w: Math.max(0, Math.min(tileW, width - x)), h: Math.max(0, Math.min(tileH, height - y)) });
    }
  }
  return rects;
}

export function extractTileRgba(page: RgbaPage, rect: TileRect): Uint8Array {
  if (rect.w === 0 || rect.h === 0) return new Uint8Array(0);
  const out = new Uint8Array(rect.w * rect.h * 4);
  const rowBytes = rect.w * 4;
  for (let r = 0; r < rect.h; r++) {
    const src = ((rect.y + r) * page.width + rect.x) * 4;
    out.set(page.rgba.subarray(src, src + rowBytes), r * rowBytes);
  }
  return out;
}

function u32(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`u32 out of range: ${n}`);
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

export async function leafHashV2(
  salt: Uint8Array,
  pageIndex: number,
  k: number,
  w: number,
  h: number,
  pixels: Uint8Array
): Promise<Uint8Array> {
  if (salt.byteLength !== SALT_BYTES) throw new Error(`Salt must be ${SALT_BYTES} bytes.`);
  if (pixels.byteLength !== w * h * 4) throw new Error(`Tile ${pageIndex}/${k}: expected ${w * h * 4} pixel bytes, got ${pixels.byteLength}.`);
  return sha256(concat([new Uint8Array([0x00]), salt, LEAF_TAG, u32(pageIndex), u32(k), u32(w), u32(h), pixels]));
}

export interface PageHashV2 {
  pageIndex: number;
  /** Leaf hashes in row-major order, one per tile. */
  leaves: Uint8Array[];
  rects: TileRect[];
  pageRoot: Uint8Array;
}

/** Hashes one page; `salts` are this page's gridSize² salts in row-major order. */
export async function hashPageV2(page: RgbaPage, gridSize: number, salts: Uint8Array[]): Promise<PageHashV2> {
  if (page.rgba.byteLength !== page.width * page.height * 4) {
    throw new Error(`Page ${page.pageIndex}: expected ${page.width * page.height * 4} RGBA bytes, got ${page.rgba.byteLength}.`);
  }
  const rects = tileRects(page.width, page.height, gridSize);
  if (salts.length !== rects.length) throw new Error(`Page ${page.pageIndex}: expected ${rects.length} salts, got ${salts.length}.`);
  const leaves = await Promise.all(
    rects.map((rect, k) => leafHashV2(salts[k], page.pageIndex, k, rect.w, rect.h, extractTileRgba(page, rect)))
  );
  return { pageIndex: page.pageIndex, leaves, rects, pageRoot: merkleTreeHash(leaves) };
}

function syncHash(data: Uint8Array): Uint8Array {
  return new Uint8Array(syncSha256.arrayBuffer(data));
}

export function documentRootV2(pageRoots: Uint8Array[]): Uint8Array {
  return syncHash(concat([new Uint8Array([0x02]), u32(pageRoots.length), merkleTreeHash(pageRoots)]));
}

export function commitmentV2(fileHash: Uint8Array, documentRoot: Uint8Array): Uint8Array {
  if (fileHash.byteLength !== 32 || documentRoot.byteLength !== 32) throw new Error("commitmentV2: inputs must be 32 bytes.");
  return syncHash(concat([new Uint8Array([0x03]), fileHash, documentRoot]));
}

/** The client hash: SHA-256 over the length-prefixed page PNGs, in page order (docs/03). */
export async function fileHashOfPngs(pngs: Uint8Array[]): Promise<Uint8Array> {
  return sha256(lengthPrefixedConcat(pngs));
}

/**
 * Version chain hash, v2: fixed-width fields instead of v1's unseparated
 * string concatenation (lib/chain-hash.ts). `previousHash` is the prior
 * version's chain hash (absent for version 1); `commitment` is this
 * version's anchored value.
 */
export function chainHashV2(params: {
  previousHash: string | null;
  commitment: string;
  versionNo: number;
  timestamp: Date;
}): string {
  const prev = params.previousHash ? concat([new Uint8Array([0x01]), fromHex(params.previousHash, 32)]) : new Uint8Array([0x00]);
  const ms = BigInt(params.timestamp.getTime());
  const ts = new Uint8Array(8);
  new DataView(ts.buffer).setBigUint64(0, ms, false);
  return toHex(syncHash(concat([new Uint8Array([0x06]), prev, fromHex(params.commitment, 32), u32(params.versionNo), ts])));
}

export function fromHex(hex: string, expectedBytes?: number): Uint8Array {
  const clean = hex.toLowerCase().replace(/^0x/, "");
  if (!/^([0-9a-f]{2})*$/.test(clean)) throw new Error("Invalid hex string.");
  if (expectedBytes !== undefined && clean.length !== expectedBytes * 2) throw new Error(`Expected ${expectedBytes} bytes of hex.`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** gridSize² × pageCount fresh CSPRNG salts (WebCrypto in both browser and Node). */
export function generateSalts(count: number): Uint8Array[] {
  return Array.from({ length: count }, () => crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

export interface DocumentHashV2 {
  gridSize: number;
  pageCount: number;
  fileHash: string;
  pageRoots: string[];
  documentRoot: string;
  commitment: string;
  /** One per tile, global index (page-major, row-major); hashHex is the salted leaf. */
  tiles: TileHash[];
}

/**
 * Finishes a v2 document hash from per-page results. Pages are hashed one
 * at a time by the caller (hashPageV2) so only one page of RGBA is held in
 * memory at once.
 */
export function assembleDocumentV2(gridSize: number, pages: PageHashV2[], fileHash: Uint8Array): DocumentHashV2 {
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  if (sorted.length === 0 || sorted.some((p, i) => p.pageIndex !== i)) throw new Error("Pages must be 0..n-1 with none missing.");
  const pageRoots = sorted.map((p) => p.pageRoot);
  const documentRoot = documentRootV2(pageRoots);
  const tiles: TileHash[] = sorted.flatMap((p) =>
    p.leaves.map((leaf, k) => ({
      index: p.pageIndex * gridSize * gridSize + k,
      pageIndex: p.pageIndex,
      row: p.rects[k].row,
      col: p.rects[k].col,
      hashHex: toHex(leaf),
    }))
  );
  return {
    gridSize,
    pageCount: sorted.length,
    fileHash: toHex(fileHash),
    pageRoots: pageRoots.map(toHex),
    documentRoot: toHex(documentRoot),
    commitment: toHex(commitmentV2(fileHash, documentRoot)),
    tiles,
  };
}

/** Convenience for callers that already hold every page: hash all pages, then assemble. */
export async function computeDocumentV2(
  pages: RgbaPage[],
  pngs: Uint8Array[],
  gridSize: number,
  salts: Uint8Array[]
): Promise<DocumentHashV2> {
  const perPage = gridSize * gridSize;
  if (salts.length !== pages.length * perPage) throw new Error(`Expected ${pages.length * perPage} salts, got ${salts.length}.`);
  const hashed: PageHashV2[] = [];
  for (const page of pages) {
    hashed.push(await hashPageV2(page, gridSize, salts.slice(page.pageIndex * perPage, (page.pageIndex + 1) * perPage)));
  }
  return assembleDocumentV2(gridSize, hashed, await fileHashOfPngs(pngs));
}
