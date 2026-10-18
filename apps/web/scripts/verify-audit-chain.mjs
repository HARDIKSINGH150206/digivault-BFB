// Independent verifier for the AuditLog hash chain (ADR-020, docs/07 P0.4).
//
// Deliberately reimplements the hash in plain node:crypto instead of
// importing apps/web/src/lib/audit-chain.ts, so it is a real cross-check:
// both implementations must reproduce src/lib/audit-chain.vectors.json.
//
// Usage (from the repo root, DB running):
//   node apps/web/scripts/verify-audit-chain.mjs            # verify the DB chain
//   node apps/web/scripts/verify-audit-chain.mjs --self-test # check against the test vectors only
// Exit code 0 = chain intact, 1 = broken, 2 = error.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENESIS = "0".repeat(64);

function canonicalJson(value) {
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

export function entryHash(e) {
  const seq = Buffer.alloc(8);
  seq.writeBigUInt64BE(BigInt(e.seq));
  const meta = e.targetMeta === null || e.targetMeta === undefined ? null : canonicalJson(e.targetMeta);
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
        opt(meta),
        str(new Date(e.timestamp).toISOString()),
        str(e.sourceIp),
      ])
    )
    .digest("hex");
}

function selfTest() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const vectors = JSON.parse(readFileSync(path.join(here, "..", "src", "lib", "audit-chain.vectors.json"), "utf8"));
  let prev = GENESIS;
  for (const v of vectors) {
    if (v.prevHash !== prev) throw new Error(`vector seq ${v.seq}: prevHash does not link`);
    const h = entryHash(v);
    if (h !== v.entryHash) throw new Error(`vector seq ${v.seq}: expected ${v.entryHash}, got ${h}`);
    prev = h;
  }
  console.log(`self-test: ${vectors.length} vectors OK`);
}

async function verifyDatabase() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const legacy = await prisma.auditLog.count({ where: { seq: null } });
    const rows = await prisma.auditLog.findMany({ where: { seq: { not: null } }, orderBy: { seq: "asc" } });
    let prev = GENESIS;
    let expectedSeq = 1;
    for (const row of rows) {
      const fail = (reason) => {
        console.error(`BROKEN at seq ${row.seq} (row ${row.id}): ${reason}`);
        console.error(`verified intact: seq 1..${expectedSeq - 1}`);
        process.exit(1);
      };
      if (row.seq !== expectedSeq) fail(`expected seq ${expectedSeq} — an entry is missing or reordered`);
      if (row.prevHash !== prev) fail("prevHash does not link to the previous entry");
      const h = entryHash(row);
      if (h !== row.entryHash) fail("entry contents do not match entryHash (edited after insert)");
      prev = h;
      expectedSeq++;
    }
    const head = rows.at(-1);
    console.log(
      head
        ? `audit chain OK: ${rows.length} entries, head seq ${head.seq} = ${head.entryHash}`
        : "audit chain OK: no chained entries yet"
    );
    if (legacy > 0) console.log(`(${legacy} pre-chain entries with seq NULL are not covered)`);
  } finally {
    await prisma.$disconnect();
  }
}

try {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    selfTest();
    await verifyDatabase();
  }
} catch (err) {
  console.error(err);
  process.exit(2);
}
