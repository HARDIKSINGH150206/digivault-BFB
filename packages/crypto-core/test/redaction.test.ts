import { describe, expect, it } from "vitest";
import { computeDocumentV2, fromHex, tileRects, type RgbaPage } from "../src/dv2";
import {
  checkRedaction,
  DEFAULT_MASK_COLOR,
  invalidRedactionProof,
  redactionLocallyValid,
  REDACTION_PROOF_FORMAT,
  type RedactionProof,
} from "../src/redaction";
// @ts-expect-error — untyped .mjs reference implementation
import * as ref from "../reference/dv2-ref.mjs";
// @ts-expect-error — untyped .mjs vector rules
import { vectorPng, vectorRgba, vectorSalt } from "../reference/gen-vectors.mjs";

// Original: two pages, the second with zero-area edge tiles (5 px over a
// grid of 4 leaves column 3 empty). Page 1's only mask is such a tile,
// which is trivially "solid".
const GRID = 4;
const SIZES: [number, number][] = [
  [23, 17],
  [5, 5],
];
const MASKED: number[][] = [[1, 5, 15], [3]];

function salts(offset: number): Buffer[] {
  return Array.from({ length: SIZES.length * GRID * GRID }, (_, g) => vectorSalt(offset + g));
}

function originalPages() {
  return SIZES.map(([width, height], p) => ({ width, height, rgba: new Uint8Array(vectorRgba(width, height, p)) }));
}

function maskPage(page: { width: number; height: number; rgba: Uint8Array }, ks: number[]) {
  const rgba = new Uint8Array(page.rgba);
  const rects = tileRects(page.width, page.height, GRID);
  for (const k of ks) {
    const r = rects[k];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) rgba.set(DEFAULT_MASK_COLOR, (y * page.width + x) * 4);
    }
  }
  return { ...page, rgba };
}

const ANCHOR = { chainId: 80002, contractAddress: "0x01e7e6f83f55873E906465d3447cB43434D4ee67", txHash: "0x" + "ab".repeat(32), anchoredAt: "2026-10-19T00:00:00.000Z" };

function fixture() {
  const orig = originalPages();
  const red = orig.map((p, i) => maskPage(p, MASKED[i]));
  const origPngs = SIZES.map((_, p) => vectorPng(p));
  // A masked page is a re-encoded PNG; an unmasked page keeps its original bytes.
  const redPngs = SIZES.map((_, p) => (MASKED[p].length ? Buffer.from(`redacted-png-${p}`) : vectorPng(p)));
  const proof: RedactionProof = ref.buildRedactionProof({
    gridSize: GRID,
    original: { versionId: "orig", versionNo: 1, pages: orig, pngs: origPngs, salts: salts(0), anchor: ANCHOR },
    redacted: { versionId: "red", versionNo: 2, pages: red, pngs: redPngs, salts: salts(5000), anchor: ANCHOR },
    maskedByPage: MASKED,
  });
  return { orig, red, origPngs, redPngs, proof };
}

const asPages = (pages: { width: number; height: number; rgba: Uint8Array }[]): RgbaPage[] =>
  pages.map((p, pageIndex) => ({ pageIndex, ...p }));
const u8 = (bufs: Buffer[]) => bufs.map((b) => new Uint8Array(b));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("redaction proofs", () => {
  it("a genuine redacted copy recomputes the ORIGINAL commitment and its own, matching the TS hash of each version", async () => {
    const { orig, red, origPngs, redPngs, proof } = fixture();
    expect(invalidRedactionProof(proof)).toBeNull();
    const check = await checkRedaction(proof, asPages(red), u8(redPngs));
    expect(redactionLocallyValid(proof, check)).toBe(true);

    const origDoc = await computeDocumentV2(asPages(orig), u8(origPngs), GRID, salts(0).map((s) => new Uint8Array(s)));
    const redDoc = await computeDocumentV2(asPages(red), u8(redPngs), GRID, salts(5000).map((s) => new Uint8Array(s)));
    expect(check.originalCommitment).toBe(origDoc.commitment);
    expect(check.redactedCommitment).toBe(redDoc.commitment);
    expect(check.pages.map((p) => [p.maskedCount, p.changedTiles, p.maskViolations])).toEqual([
      [3, [], []],
      [1, [], []],
    ]);

    // The reference verifier agrees.
    const r = ref.verifyRedactionProof(proof, red, redPngs);
    expect(r.problems).toEqual([]);
    expect(r.originalCommitment).toBe(check.originalCommitment);
    expect(r.redactedCommitment).toBe(check.redactedCommitment);
  });

  it("never reveals a masked tile's original salt", () => {
    const { proof } = fixture();
    const original = salts(0).map((s) => s.toString("hex"));
    const revealed = new Set(proof.pages.flatMap((p) => p.revealedSalts.map((s) => s.salt)));
    for (const k of MASKED[0]) expect(revealed.has(original[k])).toBe(false);
    expect(revealed.has(original[GRID * GRID + 3])).toBe(false);
    expect(revealed.size).toBe(SIZES.length * GRID * GRID - 4);
  });

  it("editing one unmasked pixel fails and names that tile", async () => {
    const { red, redPngs, proof } = fixture();
    const rects = tileRects(23, 17, GRID);
    const target = 10; // unmasked, row 2 col 2
    red[0].rgba[(rects[target].y * 23 + rects[target].x) * 4] ^= 1;
    const check = await checkRedaction(proof, asPages(red), u8(redPngs));
    expect(check.pages[0].changedTiles).toEqual([target]);
    expect(check.originalCommitment).not.toBe(proof.original.commitment);
    expect(redactionLocallyValid(proof, check)).toBe(false);
    expect(ref.verifyRedactionProof(proof, red, redPngs).problems).toContain(`page 0 tile ${target}: changed`);
  });

  it("changing a masked leaf in the proof fails", async () => {
    const { red, redPngs, proof } = fixture();
    const forged = clone(proof);
    forged.pages[0].originalLeaves[5] = "00".repeat(32);
    const check = await checkRedaction(forged, asPages(red), u8(redPngs));
    expect(check.pages[0].changedTiles).toEqual([]);
    expect(check.originalCommitment).not.toBe(proof.original.commitment);
    expect(redactionLocallyValid(forged, check)).toBe(false);
  });

  it("non-mask pixels inside a masked tile fail, even though the original commitment still recomputes", async () => {
    const { red, redPngs, proof } = fixture();
    const r = tileRects(23, 17, GRID)[5];
    red[0].rgba.set([200, 10, 10, 255], ((r.y + 1) * 23 + r.x + 1) * 4);
    const check = await checkRedaction(proof, asPages(red), u8(redPngs));
    expect(check.pages[0].maskViolations).toEqual([5]);
    // The masked leaf is taken as given, so C(original) alone can't catch this —
    // the solid-colour check is what does.
    expect(check.originalCommitment).toBe(proof.original.commitment);
    expect(redactionLocallyValid(proof, check)).toBe(false);
  });

  it("declaring an extra tile as masked (its pixels are not mask colour) fails", async () => {
    const { red, redPngs, proof } = fixture();
    const forged = clone(proof);
    forged.pages[1].masked = [0, 3];
    forged.pages[1].revealedSalts = forged.pages[1].revealedSalts.filter((s) => s.k !== 0);
    expect(invalidRedactionProof(forged)).toBeNull();
    const check = await checkRedaction(forged, asPages(red), u8(redPngs));
    expect(check.pages[1].maskViolations).toEqual([0]);
    expect(redactionLocallyValid(forged, check)).toBe(false);
  });

  it("a different mask colour in the proof fails", async () => {
    const { red, redPngs, proof } = fixture();
    const forged = clone(proof);
    forged.maskColor = [255, 255, 255, 255];
    const check = await checkRedaction(forged, asPages(red), u8(redPngs));
    expect(check.pages[0].maskViolations).toEqual([1, 5, 15]);
    expect(check.pages[1].maskViolations).toEqual([]); // tile 3 is zero-area
    expect(redactionLocallyValid(forged, check)).toBe(false);
  });

  it("the redacted version's own commitment depends on its own salts and PNG bytes", async () => {
    const { red, redPngs, proof } = fixture();
    const forged = clone(proof);
    forged.pages[1].redactedSalts[3] = "11".repeat(32);
    let check = await checkRedaction(forged, asPages(red), u8(redPngs));
    expect(check.redactedCommitment).not.toBe(proof.redacted.commitment);
    expect(check.originalCommitment).toBe(proof.original.commitment);

    check = await checkRedaction(proof, asPages(red), u8([redPngs[0], Buffer.from("re-encoded")]));
    expect(check.redactedCommitment).not.toBe(proof.redacted.commitment);
    // The original commitment uses the original's fileHash from the proof, not these bytes.
    expect(check.originalCommitment).toBe(proof.original.commitment);
  });

  it("swapped pages fail", async () => {
    const { red, redPngs, proof } = fixture();
    const forged = clone(proof);
    // Same-size pages are needed for a pure swap; use page 0 twice instead.
    const check = await checkRedaction(forged, asPages([red[0], red[0]]), u8([redPngs[0], redPngs[0]]));
    expect(check.pages[1].sizeMismatch).toBe(true);
    expect(redactionLocallyValid(forged, check)).toBe(false);
  });

  it("rejects malformed proofs", () => {
    const { proof } = fixture();
    const cases: [string, (p: RedactionProof) => void][] = [
      ["wrong format", (p) => ((p as { format: string }).format = "digivault-redaction-proof/0")],
      ["unsorted masked", (p) => (p.pages[0].masked = [5, 1, 15])],
      ["duplicate masked", (p) => (p.pages[0].masked = [1, 1, 5])],
      ["masked out of range", (p) => (p.pages[0].masked = [1, 5, GRID * GRID])],
      ["salt revealed for a masked tile", (p) => p.pages[0].revealedSalts.push({ k: 5, salt: "22".repeat(32) })],
      ["salt missing for an unmasked tile", (p) => p.pages[0].revealedSalts.shift()],
      ["unmasking without a salt", (p) => (p.pages[0].masked = [1, 15])],
      ["short leaves", (p) => p.pages[0].originalLeaves.pop()],
      ["short redacted salts", (p) => p.pages[1].redactedSalts.pop()],
      ["bad commitment", (p) => (p.original.commitment = "xyz")],
      ["same version twice", (p) => (p.redacted.versionId = p.original.versionId)],
      ["bad mask colour", (p) => (p.maskColor = [0, 0, 0] as unknown as RedactionProof["maskColor"])],
    ];
    for (const [name, mutate] of cases) {
      const p = clone(proof);
      mutate(p);
      expect(invalidRedactionProof(p), name).not.toBeNull();
    }
    expect(proof.format).toBe(REDACTION_PROOF_FORMAT);
  });

  it("works on the standard 20x20 grid", async () => {
    const width = 61;
    const height = 43;
    const grid = 20;
    const orig = [{ width, height, rgba: new Uint8Array(vectorRgba(width, height, 0)) }];
    const masked = [0, 21, 399];
    const rects = tileRects(width, height, grid);
    const rgba = new Uint8Array(orig[0].rgba);
    for (const k of masked) {
      const r = rects[k];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rgba.set(DEFAULT_MASK_COLOR, (y * width + x) * 4);
    }
    const red = [{ width, height, rgba }];
    const s = (o: number) => Array.from({ length: 400 }, (_, g) => vectorSalt(o + g));
    const proof: RedactionProof = ref.buildRedactionProof({
      gridSize: grid,
      original: { versionId: "o", versionNo: 1, pages: orig, pngs: [vectorPng(0)], salts: s(0), anchor: ANCHOR },
      redacted: { versionId: "r", versionNo: 2, pages: red, pngs: [Buffer.from("r")], salts: s(400), anchor: ANCHOR },
      maskedByPage: [masked],
    });
    const check = await checkRedaction(proof, asPages(red), [new Uint8Array(Buffer.from("r"))]);
    expect(redactionLocallyValid(proof, check)).toBe(true);
    expect(fromHex(check.originalCommitment)).toHaveLength(32);
  });
});
