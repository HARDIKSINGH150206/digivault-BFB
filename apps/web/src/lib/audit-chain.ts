import { createHash } from "node:crypto";

/**
 * AuditLog hash chain (ADR-020, docs/07 P0.4).
 *
 *   entryHash_n = SHA256( 0x04 ‖ u64be(seq) ‖ prevHash[32]
 *                         ‖ str(actorId) ‖ str(action) ‖ str(targetId)
 *                         ‖ opt(targetType) ‖ opt(canonicalJson(targetMeta))
 *                         ‖ str(timestamp ISO-8601) ‖ str(sourceIp) )
 *
 *   str(s) = u32be(byteLength) ‖ utf8(s)
 *   opt(v) = 0x00 if absent, else 0x01 ‖ str(v)
 *   prevHash for seq 1 = 32 zero bytes
 *
 * The row id is deliberately not hashed — seq is the chain identity.
 * apps/web/scripts/verify-audit-chain.mjs reimplements this independently;
 * both are checked against audit-chain.vectors.json.
 */

export const AUDIT_CHAIN_GENESIS = "0".repeat(64);
const DOMAIN_AUDIT_ENTRY = 0x04;

export interface AuditChainEntry {
  seq: number;
  prevHash: string;
  actorId: string;
  action: string;
  targetId: string;
  targetType?: string | null;
  targetMeta?: unknown;
  timestamp: Date;
  sourceIp: string;
}

/** JSON with object keys sorted recursively; undefined members dropped (as JSON/JSONB do). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const members = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${members.join(",")}}`;
}

function str(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(bytes.byteLength);
  return Buffer.concat([len, bytes]);
}

function opt(s: string | null | undefined): Buffer {
  return s === null || s === undefined ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), str(s)]);
}

export function computeAuditEntryHash(e: AuditChainEntry): string {
  if (!/^[0-9a-f]{64}$/.test(e.prevHash)) throw new Error("prevHash must be 64 lowercase hex chars.");
  const seq = Buffer.alloc(8);
  seq.writeBigUInt64BE(BigInt(e.seq));
  const meta = e.targetMeta === null || e.targetMeta === undefined ? null : canonicalJson(e.targetMeta);
  return createHash("sha256")
    .update(
      Buffer.concat([
        Buffer.from([DOMAIN_AUDIT_ENTRY]),
        seq,
        Buffer.from(e.prevHash, "hex"),
        str(e.actorId),
        str(e.action),
        str(e.targetId),
        opt(e.targetType),
        opt(meta),
        str(e.timestamp.toISOString()),
        str(e.sourceIp),
      ])
    )
    .digest("hex");
}

export type AuditChainResult =
  | { ok: true; checked: number; headSeq: number | null; headHash: string | null }
  | { ok: false; checked: number; badSeq: number; reason: string };

/** Verifies chained rows (seq not null), which must be passed in ascending seq order. */
export function verifyAuditChain(
  rows: (Omit<AuditChainEntry, "seq" | "prevHash"> & { seq: number; prevHash: string | null; entryHash: string | null })[]
): AuditChainResult {
  let expectedPrev = AUDIT_CHAIN_GENESIS;
  let expectedSeq = 1;
  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      return { ok: false, checked: expectedSeq - 1, badSeq: expectedSeq, reason: `missing or out-of-order seq (found ${row.seq})` };
    }
    if (row.prevHash !== expectedPrev) {
      return { ok: false, checked: expectedSeq - 1, badSeq: row.seq, reason: "prevHash does not link to the previous entry" };
    }
    const recomputed = computeAuditEntryHash({ ...row, prevHash: row.prevHash });
    if (row.entryHash !== recomputed) {
      return { ok: false, checked: expectedSeq - 1, badSeq: row.seq, reason: "entry contents do not match entryHash" };
    }
    expectedPrev = recomputed;
    expectedSeq++;
  }
  const head = rows.at(-1);
  return { ok: true, checked: rows.length, headSeq: head?.seq ?? null, headHash: head?.entryHash ?? null };
}
