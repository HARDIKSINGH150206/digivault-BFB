// Regenerates test/vectors.json from the reference implementation:
//   node packages/crypto-core/reference/gen-vectors.mjs
// Inputs are derived from fixed rules (below) so any reimplementation can
// rebuild them without reading binary fixtures:
//   leaf i of an MTH vector  = SHA256("dv2-vector-leaf-" + i)
//   RGBA byte j of page p    = (j·31 + p·7 + 13) mod 256
//   salt of global tile g    = SHA256("dv2-vector-salt-" + g)
//   "PNG" bytes of page p    = UTF-8 "dv2-vector-png-" + p  (fileHash only hashes bytes)
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chainHash, computeDocument, mth } from "./dv2-ref.mjs";

const sha = (s) => createHash("sha256").update(s).digest();
export const vectorLeaf = (i) => sha(`dv2-vector-leaf-${i}`);
export const vectorSalt = (g) => sha(`dv2-vector-salt-${g}`);
export const vectorPng = (p) => Buffer.from(`dv2-vector-png-${p}`, "utf8");
export function vectorRgba(width, height, p) {
  const out = Buffer.alloc(width * height * 4);
  for (let j = 0; j < out.length; j++) out[j] = (j * 31 + p * 7 + 13) & 0xff;
  return out;
}

const mthCases = [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 399, 400, 401].map((n) => ({
  n,
  root: mth(Array.from({ length: n }, (_, i) => vectorLeaf(i))).toString("hex"),
}));

const documentCases = [
  { name: "two pages, uneven sizes, grid 4", gridSize: 4, pages: [[23, 17], [20, 20]] },
  { name: "zero-area edge tiles, grid 4", gridSize: 4, pages: [[5, 5]] },
  { name: "standard 20x20 grid", gridSize: 20, pages: [[40, 40]] },
  { name: "three pages, grid 20, clipped edges", gridSize: 20, pages: [[61, 43], [41, 41], [20, 21]] },
].map(({ name, gridSize, pages }) => {
  const decoded = pages.map(([width, height], p) => ({ width, height, rgba: vectorRgba(width, height, p) }));
  const salts = Array.from({ length: pages.length * gridSize * gridSize }, (_, g) => vectorSalt(g));
  const r = computeDocument(decoded, pages.map((_, p) => vectorPng(p)), gridSize, salts);
  return {
    name,
    gridSize,
    pages: pages.map(([width, height]) => ({ width, height })),
    leaves: r.tiles.map((t) => t.hash),
    pageRoots: r.pageRoots,
    documentRoot: r.documentRoot,
    fileHash: r.fileHash,
    commitment: r.commitment,
  };
});

const c = documentCases[0].commitment;
const chainCases = [
  { previousHash: null, commitment: c, versionNo: 1, timestamp: "2026-10-19T08:30:00.123Z" },
  { previousHash: sha("prev").toString("hex"), commitment: c, versionNo: 2, timestamp: "2026-10-19T08:31:00.000Z" },
].map((x) => ({ ...x, chainHash: chainHash(x) }));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "vectors.json");
  writeFileSync(out, JSON.stringify({ format: "digivault-dv2-vectors/1", mth: mthCases, documents: documentCases, chain: chainCases }, null, 1) + "\n");
  console.log(`wrote ${out}`);
}
