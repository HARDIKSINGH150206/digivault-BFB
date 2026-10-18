import { describe, expect, it } from "vitest";
import { AUDIT_CHAIN_GENESIS, canonicalJson, computeAuditEntryHash, verifyAuditChain } from "./audit-chain";
import vectors from "./audit-chain.vectors.json";

// The vectors were produced by the independent implementation in
// scripts/verify-audit-chain.mjs; this implementation must match byte for byte.
const rows = vectors.map((v) => ({ ...v, timestamp: new Date(v.timestamp) }));

describe("audit chain", () => {
  it("matches the independent implementation's vectors", () => {
    for (const row of rows) expect(computeAuditEntryHash(row)).toBe(row.entryHash);
  });

  it("verifies an intact chain and reports its head", () => {
    expect(verifyAuditChain(rows)).toEqual({ ok: true, checked: 3, headSeq: 3, headHash: rows[2].entryHash });
  });

  it("canonicalJson is key-order independent and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}');
    expect(canonicalJson({ a: { d: [2, 1] }, b: 1 })).toBe(canonicalJson({ b: 1, a: { d: [2, 1] } }));
  });

  it("detects an edited field", () => {
    const edited = rows.map((r) => (r.seq === 2 ? { ...r, sourceIp: "1.2.3.4" } : r));
    expect(verifyAuditChain(edited)).toMatchObject({ ok: false, badSeq: 2 });
  });

  it("detects edited metadata", () => {
    const edited = rows.map((r) => (r.seq === 2 ? { ...r, targetMeta: { ...r.targetMeta, versionNo: 3 } } : r));
    expect(verifyAuditChain(edited)).toMatchObject({ ok: false, badSeq: 2 });
  });

  it("detects a deleted entry", () => {
    expect(verifyAuditChain([rows[0], rows[2]])).toMatchObject({ ok: false, badSeq: 2 });
  });

  it("detects a re-hashed edit (the next entry no longer links)", () => {
    const forged = { ...rows[1], action: "SHARE_CREATED" };
    forged.entryHash = computeAuditEntryHash(forged);
    expect(verifyAuditChain([rows[0], forged, rows[2]])).toMatchObject({ ok: false, badSeq: 3 });
  });

  it("distinguishes absent targetType from empty string", () => {
    const base = { ...rows[2], prevHash: AUDIT_CHAIN_GENESIS };
    expect(computeAuditEntryHash({ ...base, targetType: null })).not.toBe(
      computeAuditEntryHash({ ...base, targetType: "" })
    );
  });
});
