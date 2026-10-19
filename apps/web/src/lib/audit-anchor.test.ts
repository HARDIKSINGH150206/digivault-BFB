import { describe, expect, it } from "vitest";
import { auditAnchorIntervalHours, compareWithAnchoredHead } from "./audit-anchor";
import type { AuditChainResult } from "./audit-chain";

const h = (n: number) => n.toString(16).padStart(64, "0");
const intact = (headSeq: number): AuditChainResult => ({ ok: true, checked: headSeq, headSeq, headHash: h(headSeq) });
const db = (seq: number) => h(seq);

describe("audit head comparison (docs/07 Phase 4)", () => {
  it("matches when the database entry at the anchored seq is the anchored head", () => {
    expect(compareWithAnchoredHead(intact(20), { seq: 15, head: h(15) }, db)).toEqual({ anchoredMatches: true, unanchoredEntries: 5 });
    expect(compareWithAnchoredHead(intact(15), { seq: 15, head: h(15) }, db)).toEqual({ anchoredMatches: true, unanchoredEntries: 0 });
  });

  it("flags a rewrite: a consistent chain whose entry at the anchored seq differs", () => {
    expect(compareWithAnchoredHead(intact(20), { seq: 15, head: h(999) }, db).anchoredMatches).toBe(false);
  });

  it("flags deleted entries: the anchored seq is beyond the database's last entry", () => {
    expect(compareWithAnchoredHead(intact(10), { seq: 15, head: h(15) }, (seq) => (seq <= 10 ? h(seq) : null)).anchoredMatches).toBe(false);
  });

  it("has nothing to compare before the first anchor", () => {
    expect(compareWithAnchoredHead(intact(7), null, db)).toEqual({ anchoredMatches: null, unanchoredEntries: 7 });
    expect(compareWithAnchoredHead(intact(7), { seq: 0, head: h(0) }, db)).toEqual({ anchoredMatches: null, unanchoredEntries: 7 });
  });

  it("does not count unanchored entries of a broken chain", () => {
    const broken: AuditChainResult = { ok: false, checked: 4, badSeq: 5, reason: "edited" };
    expect(compareWithAnchoredHead(broken, { seq: 3, head: h(3) }, db)).toEqual({ anchoredMatches: true, unanchoredEntries: null });
  });
});

describe("AUDIT_ANCHOR_INTERVAL_HOURS", () => {
  it("defaults to 6 hours, 0 turns the schedule off, fractions allowed", () => {
    expect(auditAnchorIntervalHours({})).toBe(6);
    expect(auditAnchorIntervalHours({ AUDIT_ANCHOR_INTERVAL_HOURS: "" })).toBe(6);
    expect(auditAnchorIntervalHours({ AUDIT_ANCHOR_INTERVAL_HOURS: "0" })).toBe(0);
    expect(auditAnchorIntervalHours({ AUDIT_ANCHOR_INTERVAL_HOURS: "0.5" })).toBe(0.5);
  });

  it("rejects nonsense", () => {
    expect(() => auditAnchorIntervalHours({ AUDIT_ANCHOR_INTERVAL_HOURS: "-1" })).toThrow();
    expect(() => auditAnchorIntervalHours({ AUDIT_ANCHOR_INTERVAL_HOURS: "six" })).toThrow();
  });
});
