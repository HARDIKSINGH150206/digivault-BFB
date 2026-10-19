import { describe, expect, it } from "vitest";
import { buildPublicProof, publicVerifyUrl, PUBLIC_PROOF_KEYS, type PublicProofInput } from "./public-proof";

const root = "ab".repeat(32);
const tx = `0x${"cd".repeat(32)}`;
const input: PublicProofInput = {
  proofVersion: 2,
  documentVersionId: "cmve0bgx800np90byea6o4hss",
  commitment: root,
  gridSize: 20,
  pageCount: 3,
  isRedacted: true,
  anchor: { chainId: 80002, contractAddress: "0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b", txHash: tx, anchoredAt: new Date("2026-10-18T10:00:00Z") },
};

describe("public verify URL", () => {
  it("embeds versionId, commitment and txHash under PUBLIC_BASE_URL", () => {
    const url = new URL(publicVerifyUrl({ documentVersionId: "ver_1", commitment: `0x${root.toUpperCase()}`, txHash: tx }, "http://192.168.1.20:3000/"));
    expect(url.origin).toBe("http://192.168.1.20:3000");
    expect(url.pathname).toBe("/verify");
    expect(Object.fromEntries(url.searchParams)).toEqual({ v: "ver_1", c: root, tx });
  });

  it("works with a tunnel base URL that has a path prefix", () => {
    expect(publicVerifyUrl({ documentVersionId: "v", commitment: root, txHash: tx }, "https://demo.example.dev/digivault")).toMatch(
      /^https:\/\/demo\.example\.dev\/digivault\/verify\?v=v&c=/
    );
  });

  it("defaults to localhost when PUBLIC_BASE_URL is unset", () => {
    expect(publicVerifyUrl({ documentVersionId: "v", commitment: root, txHash: tx }, undefined)).toMatch(/^http:\/\/localhost:3000\/verify\?/);
  });
});

describe("public proof", () => {
  it("contains only the allowlisted, redaction-safe fields", () => {
    const proof = buildPublicProof(input, "http://localhost:3000");
    expect(Object.keys(proof).sort()).toEqual([...PUBLIC_PROOF_KEYS].sort());
    const json = JSON.stringify(proof);
    for (const forbidden of ["tiles", "pages", "salt", "title", "case", "fir", "name"]) {
      expect(json.toLowerCase()).not.toContain(`"${forbidden}`);
    }
  });

  it("uses the verification-proof v2 field names", () => {
    const proof = buildPublicProof(input) as Record<string, any>;
    expect(proof.commitment).toBe(root);
    expect(proof.anchor.polygon_chain_id).toBe(80002);
    expect(proof.anchor.polygon_tx_hash).toBe(tx);
  });

  it("rejects malformed hashes", () => {
    expect(() => buildPublicProof({ ...input, commitment: "xyz" })).toThrow();
    expect(() => buildPublicProof({ ...input, anchor: { ...input.anchor, txHash: "0x12" } })).toThrow();
  });
});
