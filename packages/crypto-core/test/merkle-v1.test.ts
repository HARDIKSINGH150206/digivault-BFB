import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMerkleTree, getProofForLeaf, verifyProof } from "../src/merkle";
import { lengthPrefixedConcat, sha256, toHex } from "../src/hash";
import type { TileHash } from "../src/types";

// Characterization tests for the CURRENT (v1) construction in docs/03.
// They pin today's behavior so the v2 change (docs/07 Phase 1) is a
// deliberate, visible break rather than an accidental one.

function sha256hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function tiles(n: number, seed = "tile"): TileHash[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    pageIndex: 0,
    row: Math.floor(i / 20),
    col: i % 20,
    hashHex: sha256hex(`${seed}-${i}`),
  }));
}

// Independent reimplementation (plain node:crypto): pairwise SHA-256,
// a leftover odd node carried up unchanged — the same reference the
// smoke test uses (apps/web/scripts/smoke-test.mjs).
function referenceRoot(leafHexes: string[]): string {
  let level = leafHexes.map((h) => Buffer.from(h, "hex"));
  while (level.length > 1) {
    const next: Buffer[] = [];
    let i = 0;
    for (; i + 1 < level.length; i += 2) {
      next.push(createHash("sha256").update(Buffer.concat([level[i], level[i + 1]])).digest());
    }
    if (i < level.length) next.push(level[i]);
    level = next;
  }
  return level[0].toString("hex");
}

describe("hash helpers", () => {
  it("sha256 matches node:crypto", async () => {
    expect(toHex(await sha256(new TextEncoder().encode("digivault")))).toBe(sha256hex("digivault"));
  });

  it("lengthPrefixedConcat uses a 4-byte big-endian length per part", () => {
    const out = lengthPrefixedConcat([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect([...out]).toEqual([0, 0, 0, 2, 1, 2, 0, 0, 0, 1, 3]);
  });

  it("lengthPrefixedConcat distinguishes [ab] from [a,b]", () => {
    const joined = lengthPrefixedConcat([new Uint8Array([1, 2])]);
    const split = lengthPrefixedConcat([new Uint8Array([1]), new Uint8Array([2])]);
    expect(toHex(joined)).not.toBe(toHex(split));
  });
});

describe("v1 Merkle tree", () => {
  it.each([1, 2, 3, 7, 399, 400, 401])("matches the independent reference for %i leaves", (n) => {
    const t = tiles(n);
    expect(buildMerkleTree(t).rootHex).toBe(referenceRoot(t.map((x) => x.hashHex)));
  });

  it("is deterministic and independent of input array order (sorted by index)", () => {
    const t = tiles(400);
    const shuffled = [...t].reverse();
    expect(buildMerkleTree(shuffled).rootHex).toBe(buildMerkleTree(t).rootHex);
  });

  it("changing one leaf changes the root", () => {
    const t = tiles(400);
    const tampered = t.map((x) => (x.index === 137 ? { ...x, hashHex: sha256hex("tampered") } : x));
    expect(buildMerkleTree(tampered).rootHex).not.toBe(buildMerkleTree(t).rootHex);
  });

  it("proofs verify for every leaf and fail against another root", () => {
    const t = tiles(23);
    const built = buildMerkleTree(t);
    const other = buildMerkleTree(tiles(23, "other")).rootHex;
    for (const leaf of built.leavesHex) {
      const proof = getProofForLeaf(built.tree, leaf);
      expect(verifyProof(built.tree, proof, leaf, built.rootHex)).toBe(true);
      expect(verifyProof(built.tree, proof, leaf, other)).toBe(false);
    }
  });
});
