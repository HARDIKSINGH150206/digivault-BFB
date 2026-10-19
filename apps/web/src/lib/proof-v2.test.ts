import { describe, expect, it } from "vitest";
import { anchoredValue, buildVerificationProofV2, parseUploadSalts, type VerificationProofV2Input } from "./proof-v2";
import { revealableSalts } from "./tile-salts";

const hex = (b: string) => b.repeat(32);

describe("anchoredValue", () => {
  it("is the merkle root for v1 and the commitment for v2", () => {
    expect(anchoredValue({ proofVersion: 1, merkleRoot: hex("aa"), commitment: null })).toBe(hex("aa"));
    expect(anchoredValue({ proofVersion: 2, merkleRoot: hex("aa"), commitment: hex("bb") })).toBe(hex("bb"));
  });

  it("refuses a v2 version without a commitment", () => {
    expect(() => anchoredValue({ proofVersion: 2, merkleRoot: hex("aa"), commitment: null })).toThrow();
  });
});

describe("parseUploadSalts", () => {
  const salts = (n: number) => Array.from({ length: n }, (_, i) => i.toString(16).padStart(64, "0"));

  it("accepts the right number of distinct 32-byte hex salts", () => {
    const r = parseUploadSalts(salts(400), 400);
    expect("salts" in r && r.salts.every((b) => b.length === 32)).toBe(true);
  });

  it.each([
    ["wrong count", salts(399)],
    ["not an array", "abc"],
    ["uppercase hex", [...salts(399), "F".repeat(64)]],
    ["short salt", [...salts(399), "ab"]],
    ["duplicates", [...salts(399), salts(1)[0]]],
    ["all zero", Array(400).fill("0".repeat(64))],
  ])("rejects %s", (_name, raw) => {
    expect("error" in parseUploadSalts(raw, 400)).toBe(true);
  });
});

describe("buildVerificationProofV2", () => {
  const salts = Array.from({ length: 4 }, (_, i) => Buffer.alloc(32, i + 1));
  const input: VerificationProofV2Input = {
    documentVersionId: "ver_1",
    isRedacted: false,
    gridSize: 2,
    fileHash: hex("01"),
    documentRoot: hex("02"),
    commitment: hex("03"),
    pages: [{ pageIndex: 0, widthPx: 10, heightPx: 10, pngSha256: hex("04"), pageRoot: hex("05") }],
    tiles: [0, 1, 2, 3].map((i) => ({ tileIndex: i, leaf: hex(`a${i}`) })),
    salts: revealableSalts(salts, []),
    anchor: { chainId: 80002, contractAddress: "0xabc", txHash: `0x${hex("cd")}`, anchoredAt: new Date("2026-10-19T00:00:00Z") },
  };

  it("pairs every tile with its salt and leaf", () => {
    const proof = buildVerificationProofV2(input);
    expect(proof.digivault_proof_version).toBe(2);
    expect(proof.page_count).toBe(1);
    expect(proof.tiles).toEqual([0, 1, 2, 3].map((i) => ({ tile_index: i, leaf: hex(`a${i}`), salt: salts[i].toString("hex") })));
  });

  it("refuses to build a proof with a withheld salt", () => {
    expect(() => buildVerificationProofV2({ ...input, salts: revealableSalts(salts, [2]) })).toThrow();
  });
});
