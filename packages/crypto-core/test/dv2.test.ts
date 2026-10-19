import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assembleDocumentV2,
  chainHashV2,
  commitmentV2,
  computeDocumentV2,
  documentRootV2,
  fileHashOfPngs,
  fromHex,
  generateSalts,
  hashPageV2,
  leafHashV2,
  tileRects,
  type RgbaPage,
} from "../src/dv2";
import { inclusionPath, merkleTreeHash, nodeHash, rootFromInclusionPath, verifyInclusion } from "../src/merkle-v2";
import { toHex } from "../src/hash";
import vectors from "./vectors.json";
// @ts-expect-error — untyped .mjs reference implementation
import * as ref from "../reference/dv2-ref.mjs";
// @ts-expect-error — untyped .mjs vector rules
import { vectorLeaf, vectorPng, vectorRgba, vectorSalt } from "../reference/gen-vectors.mjs";

const sha = (s: string | Uint8Array) => new Uint8Array(createHash("sha256").update(s).digest());
const leaves = (n: number) => Array.from({ length: n }, (_, i) => sha(`leaf-${i}`));

function page(width: number, height: number, pageIndex: number): RgbaPage {
  return { pageIndex, width, height, rgba: new Uint8Array(vectorRgba(width, height, pageIndex)) };
}

function fixedSalts(n: number, offset = 0): Uint8Array[] {
  return Array.from({ length: n }, (_, i) => new Uint8Array(vectorSalt(offset + i)));
}

const PNGS = [new Uint8Array(vectorPng(0)), new Uint8Array(vectorPng(1))];

describe("RFC 6962 tree (merkle-v2)", () => {
  // RFC 6962 reference vectors, as used by Certificate Transparency
  // implementations: leaf inputs and the MTH of the first n of them.
  const ctInputs = ["", "00", "10", "2021", "3031", "40414243", "5051525354555657", "606162636465666768696a6b6c6d6e6f"];
  const ctRoots = [
    "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
    "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
    "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
    "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
    "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
    "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
    "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
  ];
  it("matches the RFC 6962 / Certificate Transparency reference roots", () => {
    const ctLeaves = ctInputs.map((hex) => sha(new Uint8Array([0x00, ...fromHex(hex)])));
    for (let n = 1; n <= 8; n++) expect(toHex(merkleTreeHash(ctLeaves.slice(0, n)))).toBe(ctRoots[n - 1]);
  });

  it("matches the vector file and the bottom-up reference for many sizes", () => {
    for (const { n, root } of vectors.mth) {
      const ls = Array.from({ length: n }, (_, i) => new Uint8Array(vectorLeaf(i)));
      expect(toHex(merkleTreeHash(ls))).toBe(root);
      expect(ref.mth(ls).toString("hex")).toBe(root);
    }
  });

  it("carries an odd node up instead of duplicating it", () => {
    const [a, b, c] = leaves(3);
    expect(toHex(merkleTreeHash([a, b, c]))).toBe(toHex(nodeHash(nodeHash(a, b), c)));
  });

  it("rejects a duplicated last leaf (no CVE-2012-2459 second tree)", () => {
    for (const n of [1, 3, 5, 399]) {
      const ls = leaves(n);
      expect(toHex(merkleTreeHash([...ls, ls[n - 1]]))).not.toBe(toHex(merkleTreeHash(ls)));
    }
  });

  it.each([1, 2, 3, 4, 5, 7, 8, 17, 399, 400, 401])("inclusion proofs verify for every index (n = %i)", (n) => {
    const ls = leaves(n);
    const root = merkleTreeHash(ls);
    for (let i = 0; i < n; i++) expect(verifyInclusion(ls[i], i, n, inclusionPath(ls, i), root)).toBe(true);
  });

  it("rejects a wrong index, a wrong tree size and a tampered path", () => {
    const ls = leaves(400);
    const root = merkleTreeHash(ls);
    const path = inclusionPath(ls, 123);
    expect(verifyInclusion(ls[123], 124, 400, path, root)).toBe(false);
    // A path does not authenticate the tree size by itself (RFC 6962: sizes
    // with the same shape — 257..512 for this index — accept the same path), so
    // DigiVault never takes the size from a proof: it is gridSize² per page.
    // Sizes with a different shape are refused.
    expect(verifyInclusion(ls[123], 123, 256, path, root)).toBe(false);
    expect(verifyInclusion(ls[123], 123, 1024, path, root)).toBe(false);
    expect(verifyInclusion(ls[123], 123, 512, path, root)).toBe(true);
    expect(verifyInclusion(ls[123], 400, 400, path, root)).toBe(false);
    const bad = path.map((p, i) => (i === 3 ? sha("x") : p));
    expect(verifyInclusion(ls[123], 123, 400, bad, root)).toBe(false);
    expect(verifyInclusion(ls[123], 123, 400, [...path, sha("extra")], root)).toBe(false);
    expect(verifyInclusion(ls[123], 123, 400, path.slice(0, -1), root)).toBe(false);
  });

  it("rejects an inner node presented as a leaf", () => {
    const ls = leaves(400);
    const root = merkleTreeHash(ls);
    // The node over leaves 0..1 plus the rest of leaf 0's path is too short
    // for a 400-leaf tree, at any index.
    const inner = nodeHash(ls[0], ls[1]);
    const rest = inclusionPath(ls, 0).slice(1);
    for (const index of [0, 1, 2]) expect(verifyInclusion(inner, index, 400, rest, root)).toBe(false);
    expect(rootFromInclusionPath(inner, 0, 400, rest)).toBeNull();
    // It would rebuild the root as a 200-leaf tree — the reason the size is
    // fixed by the grid, and why verifiers recompute every leaf as
    // H(0x00 ‖ salt ‖ …) from pixels and never accept a leaf hash as input:
    // no tile's leaf preimage can start with an inner node's 0x01 prefix.
    expect(verifyInclusion(inner, 0, 200, rest, root)).toBe(true);
  });
});

describe("v2 leaves, page roots, R and C (dv2)", () => {
  it.each(vectors.documents.map((d) => [d.name, d] as const))("matches vector: %s", async (_name, v) => {
    const pages = v.pages.map((p, i) => page(p.width, p.height, i));
    const pngs = v.pages.map((_, i) => new Uint8Array(vectorPng(i)));
    const r = await computeDocumentV2(pages, pngs, v.gridSize, fixedSalts(v.leaves.length));
    expect(r.tiles.map((t) => t.hashHex)).toEqual(v.leaves);
    expect(r.pageRoots).toEqual(v.pageRoots);
    expect(r.documentRoot).toBe(v.documentRoot);
    expect(r.fileHash).toBe(v.fileHash);
    expect(r.commitment).toBe(v.commitment);
  });

  it("same pages and same salts give the same R and C across 20 runs", async () => {
    const pages = [page(61, 43, 0), page(41, 41, 1)];
    const salts = fixedSalts(800);
    const first = await computeDocumentV2(pages, PNGS, 20, salts);
    for (let i = 0; i < 20; i++) {
      const again = await computeDocumentV2(pages, PNGS, 20, salts);
      expect(again.documentRoot).toBe(first.documentRoot);
      expect(again.commitment).toBe(first.commitment);
    }
  });

  it("changing one pixel changes exactly one leaf, its page root, R and C", async () => {
    const pages = [page(61, 43, 0), page(41, 41, 1)];
    const salts = fixedSalts(800);
    const before = await computeDocumentV2(pages, PNGS, 20, salts);
    const edited = { ...pages[1], rgba: new Uint8Array(pages[1].rgba) };
    // Pixel (x=10, y=7) of page 1: tile width/height 3 -> row 2, col 3 -> k 43.
    edited.rgba[(7 * 41 + 10) * 4] ^= 0x01;
    const after = await computeDocumentV2([pages[0], edited], PNGS, 20, salts);
    const changed = after.tiles.filter((t, i) => t.hashHex !== before.tiles[i].hashHex).map((t) => t.index);
    expect(changed).toEqual([400 + 43]);
    expect(after.pageRoots[0]).toBe(before.pageRoots[0]);
    expect(after.pageRoots[1]).not.toBe(before.pageRoots[1]);
    expect(after.documentRoot).not.toBe(before.documentRoot);
    expect(after.commitment).not.toBe(before.commitment);
  });

  it("different salts give different leaves and C for identical pixels", async () => {
    const pages = [page(40, 40, 0)];
    const a = await computeDocumentV2(pages, [PNGS[0]], 20, generateSalts(400));
    const b = await computeDocumentV2(pages, [PNGS[0]], 20, generateSalts(400));
    expect(a.tiles.every((t, i) => t.hashHex !== b.tiles[i].hashHex)).toBe(true);
    expect(a.commitment).not.toBe(b.commitment);
  });

  it("binds the page number and tile position into each leaf", async () => {
    const salt = fixedSalts(1)[0];
    const px = new Uint8Array(4 * 4 * 4).fill(7);
    const base = toHex(await leafHashV2(salt, 0, 5, 4, 4, px));
    expect(toHex(await leafHashV2(salt, 1, 5, 4, 4, px))).not.toBe(base);
    expect(toHex(await leafHashV2(salt, 0, 6, 4, 4, px))).not.toBe(base);
    expect(toHex(await leafHashV2(salt, 0, 5, 2, 8, px))).not.toBe(base);
  });

  it("binds the page count: same page roots under a different count give a different R", () => {
    const roots = leaves(3);
    expect(toHex(documentRootV2(roots))).not.toBe(toHex(documentRootV2(roots.slice(0, 2))));
    // R is not just MTH(pageRoots): the 0x02 prefix and count are hashed in.
    expect(toHex(documentRootV2(roots))).not.toBe(toHex(merkleTreeHash(roots)));
  });

  it("a page root from another page does not verify in its place", async () => {
    const pages = [page(41, 41, 0), page(41, 41, 1)];
    const salts = fixedSalts(800);
    const p0 = await hashPageV2(pages[0], 20, salts.slice(0, 400));
    const p1 = await hashPageV2(pages[1], 20, salts.slice(400));
    // Page 1's leaves hashed as if they were page 0 (same pixels, same salts) differ.
    const p1AsPage0 = await hashPageV2({ ...pages[1], pageIndex: 0 }, 20, salts.slice(400));
    expect(toHex(p1AsPage0.pageRoot)).not.toBe(toHex(p1.pageRoot));
    // A page-1 leaf with page 1's path does not verify against page 0's root.
    const path = inclusionPath(p1.leaves, 10);
    expect(verifyInclusion(p1.leaves[10], 10, 400, path, p1.pageRoot)).toBe(true);
    expect(verifyInclusion(p1.leaves[10], 10, 400, path, p0.pageRoot)).toBe(false);
  });

  it("C binds the file hash: same pixels, different PNG bytes, different C", async () => {
    const pages = [page(40, 40, 0)];
    const salts = fixedSalts(400);
    const a = await computeDocumentV2(pages, [PNGS[0]], 20, salts);
    const b = await computeDocumentV2(pages, [PNGS[1]], 20, salts);
    expect(a.documentRoot).toBe(b.documentRoot);
    expect(a.commitment).not.toBe(b.commitment);
    expect(a.commitment).toBe(toHex(commitmentV2(fromHex(a.fileHash), fromHex(a.documentRoot))));
    expect(a.fileHash).toBe(toHex(await fileHashOfPngs([PNGS[0]])));
  });

  it("assembles pages hashed out of order, and refuses gaps", async () => {
    const salts = fixedSalts(800);
    const p0 = await hashPageV2(page(41, 41, 0), 20, salts.slice(0, 400));
    const p1 = await hashPageV2(page(41, 41, 1), 20, salts.slice(400));
    const fh = await fileHashOfPngs(PNGS);
    expect(assembleDocumentV2(20, [p1, p0], fh).commitment).toBe(assembleDocumentV2(20, [p0, p1], fh).commitment);
    expect(() => assembleDocumentV2(20, [p1], fh)).toThrow();
  });

  it("refuses the wrong number of salts or pixel bytes", async () => {
    await expect(hashPageV2(page(40, 40, 0), 20, fixedSalts(399))).rejects.toThrow();
    await expect(hashPageV2({ ...page(40, 40, 0), rgba: new Uint8Array(10) }, 20, fixedSalts(400))).rejects.toThrow();
    await expect(leafHashV2(new Uint8Array(31), 0, 0, 0, 0, new Uint8Array(0))).rejects.toThrow();
  });

  it("clamps zero-area edge tiles to w or h = 0 with no pixels", () => {
    const rects = tileRects(5, 5, 4);
    expect(rects.filter((r) => r.w === 0 || r.h === 0).length).toBe(7);
    expect(rects.every((r) => r.w >= 0 && r.h >= 0)).toBe(true);
  });

  it("generates distinct 32-byte salts", () => {
    const s = generateSalts(1000).map(toHex);
    expect(new Set(s).size).toBe(1000);
    expect(s.every((x) => x.length === 64)).toBe(true);
  });
});

describe("chain hash v2", () => {
  it("matches the vectors and the reference", () => {
    for (const v of vectors.chain) {
      const params = { ...v, timestamp: new Date(v.timestamp) };
      expect(chainHashV2(params)).toBe(v.chainHash);
      expect(ref.chainHash(params)).toBe(v.chainHash);
    }
  });

  it("is sensitive to every field and to the presence of a previous hash", () => {
    const base = { previousHash: null, commitment: vectors.chain[0].commitment, versionNo: 1, timestamp: new Date(vectors.chain[0].timestamp) };
    const h = chainHashV2(base);
    expect(chainHashV2({ ...base, versionNo: 2 })).not.toBe(h);
    expect(chainHashV2({ ...base, timestamp: new Date(base.timestamp.getTime() + 1) })).not.toBe(h);
    expect(chainHashV2({ ...base, previousHash: "0".repeat(64) })).not.toBe(h);
    expect(chainHashV2({ ...base, commitment: "f".repeat(64) })).not.toBe(h);
  });
});
