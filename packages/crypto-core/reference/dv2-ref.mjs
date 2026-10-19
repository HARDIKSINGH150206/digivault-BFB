// Reference implementation of DigiVault proof format v2 (docs/03 §v2), in
// plain node:crypto, deliberately NOT sharing code with src/dv2.ts or
// src/merkle-v2.ts. The tree is built bottom-up (pair neighbours, carry an
// odd node up), which yields the same root as RFC 6962's top-down split at
// the largest power of two — so agreement between the two is a real check.
//
// Used by test/vectors.json generation (gen-vectors.mjs), the crypto-core
// tests, apps/web/scripts/smoke-test.mjs and apps/web/prisma/seed-demo.ts.
import { createHash, randomBytes } from "node:crypto";

export const SALT_BYTES = 32;

const H = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/** leaf = H(0x00 ‖ salt ‖ "DV2" ‖ u32 page ‖ u32 k ‖ u32 w ‖ u32 h ‖ rgba) */
export function leafHash(salt, page, k, w, h, pixels) {
  if (salt.length !== SALT_BYTES) throw new Error("salt must be 32 bytes");
  if (pixels.length !== w * h * 4) throw new Error("pixel length mismatch");
  return H(Buffer.from([0x00]), salt, Buffer.from("DV2", "ascii"), u32(page), u32(k), u32(w), u32(h), pixels);
}

/** RFC 6962 MTH over already-hashed leaves, computed bottom-up. */
export function mth(leaves) {
  if (leaves.length === 0) throw new Error("empty tree");
  let level = leaves.map((l) => Buffer.from(l));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i + 1 < level.length; i += 2) next.push(H(Buffer.from([0x01]), level[i], level[i + 1]));
    if (level.length % 2 === 1) next.push(level[level.length - 1]);
    level = next;
  }
  return level[0];
}

/** Leaves of one page from raw RGBA (row-major), ceil-sized grid, last row/col clipped. */
export function pageLeaves(rgba, width, height, gridSize, pageIndex, pageSalts) {
  const tileW = Math.ceil(width / gridSize);
  const tileH = Math.ceil(height / gridSize);
  const leaves = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * tileW;
      const y = row * tileH;
      const w = Math.max(0, Math.min(tileW, width - x));
      const h = Math.max(0, Math.min(tileH, height - y));
      const px = Buffer.alloc(w * h * 4);
      if (w > 0 && h > 0) {
        for (let r = 0; r < h; r++) {
          const src = ((y + r) * width + x) * 4;
          Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength).copy(px, r * w * 4, src, src + w * 4);
        }
      }
      const k = row * gridSize + col;
      leaves.push(leafHash(pageSalts[k], pageIndex, k, w, h, px));
    }
  }
  return leaves;
}

export function documentRoot(pageRoots) {
  return H(Buffer.from([0x02]), u32(pageRoots.length), mth(pageRoots));
}

export function fileHash(pngs) {
  return H(...pngs.flatMap((p) => [u32(p.length), p]));
}

export function commitment(fileHashBytes, root) {
  return H(Buffer.from([0x03]), fileHashBytes, root);
}

/** chainHash = H(0x06 ‖ (0x00 | 0x01 ‖ prev[32]) ‖ C ‖ u32 versionNo ‖ u64 timestampMs) */
export function chainHash({ previousHash, commitment: c, versionNo, timestamp }) {
  const prev = previousHash ? Buffer.concat([Buffer.from([0x01]), Buffer.from(previousHash, "hex")]) : Buffer.from([0x00]);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(new Date(timestamp).getTime()));
  return H(Buffer.from([0x06]), prev, Buffer.from(c, "hex"), u32(versionNo), ts).toString("hex");
}

export function randomSalts(n) {
  return Array.from({ length: n }, () => randomBytes(SALT_BYTES));
}

/**
 * Whole document from decoded pages: [{ rgba, width, height }] in page order,
 * their PNG bytes, the grid size and pageCount·grid² salts (Buffers).
 * Returns hex strings plus the upload-ready tiles[] list.
 */
export function computeDocument(pages, pngs, gridSize, salts) {
  const perPage = gridSize * gridSize;
  if (salts.length !== pages.length * perPage) throw new Error("salt count mismatch");
  const tiles = [];
  const pageRoots = pages.map((p, pageIndex) => {
    const leaves = pageLeaves(p.rgba, p.width, p.height, gridSize, pageIndex, salts.slice(pageIndex * perPage, (pageIndex + 1) * perPage));
    leaves.forEach((leaf, k) =>
      tiles.push({
        tile_index: pageIndex * perPage + k,
        page_index: pageIndex,
        row: Math.floor(k / gridSize),
        col: k % gridSize,
        hash: leaf.toString("hex"),
      })
    );
    return mth(leaves);
  });
  const root = documentRoot(pageRoots);
  const fh = fileHash(pngs);
  return {
    fileHash: fh.toString("hex"),
    pageRoots: pageRoots.map((r) => r.toString("hex")),
    documentRoot: root.toString("hex"),
    commitment: commitment(fh, root).toString("hex"),
    tiles,
  };
}
