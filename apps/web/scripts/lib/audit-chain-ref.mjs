// Reference implementation of the AuditLog hash chain (ADR-020) and the
// legacy-rows digest (ADR-026), in plain node:crypto. Deliberately NOT
// shared with apps/web/src/lib/audit-chain.ts: both must reproduce
// src/lib/audit-chain.vectors.json, which makes each a check on the other.
// Used by verify-audit-chain.mjs and audit-legacy-genesis.mjs.
import { createHash } from "node:crypto";

export const GENESIS_PREV_HASH = "0".repeat(64);
export const LEGACY_GENESIS_ACTION = "AUDIT_LEGACY_GENESIS";
export const LEGACY_GENESIS_ANCHOR_KEY = "digivault:audit-legacy-genesis:v1";
export const AUDIT_CHAIN_LOCK_KEY = 4471809; // same as lib/audit.ts

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",")}}`;
}

function str(s) {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(bytes.byteLength);
  return Buffer.concat([len, bytes]);
}

function opt(s) {
  return s === null || s === undefined ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), str(s)]);
}

function metaOf(e) {
  return e.targetMeta === null || e.targetMeta === undefined ? null : canonicalJson(e.targetMeta);
}

/** entryHash = SHA256(0x04 ‖ u64 seq ‖ prevHash ‖ fields) — see lib/audit-chain.ts. */
export function entryHash(e) {
  const seq = Buffer.alloc(8);
  seq.writeBigUInt64BE(BigInt(e.seq));
  return createHash("sha256")
    .update(
      Buffer.concat([
        Buffer.from([0x04]),
        seq,
        Buffer.from(e.prevHash, "hex"),
        str(e.actorId),
        str(e.action),
        str(e.targetId),
        opt(e.targetType),
        opt(metaOf(e)),
        str(new Date(e.timestamp).toISOString()),
        str(e.sourceIp),
      ])
    )
    .digest("hex");
}

/**
 * Digest over the pre-chain rows (seq NULL), ordered by timestamp then id:
 *   SHA256(0x05 ‖ u32 count ‖ for each row: str(id) ‖ str(actorId) ‖ str(action)
 *          ‖ str(targetId) ‖ opt(targetType) ‖ opt(canonicalJson(targetMeta))
 *          ‖ str(timestamp ISO) ‖ str(sourceIp))
 * The row id IS included here: legacy rows have no seq to identify them.
 */
export function legacyRowsDigest(rows) {
  const sorted = [...rows].sort((a, b) => {
    const t = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const count = Buffer.alloc(4);
  count.writeUInt32BE(sorted.length);
  const h = createHash("sha256").update(Buffer.from([0x05])).update(count);
  for (const r of sorted) {
    h.update(
      Buffer.concat([
        str(r.id),
        str(r.actorId),
        str(r.action),
        str(r.targetId),
        opt(r.targetType),
        opt(metaOf(r)),
        str(new Date(r.timestamp).toISOString()),
        str(r.sourceIp),
      ])
    );
  }
  return h.digest("hex");
}
