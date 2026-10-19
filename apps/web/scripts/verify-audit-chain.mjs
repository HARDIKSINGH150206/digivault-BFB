// Independent verifier for the AuditLog hash chain (ADR-020) and the
// legacy-rows genesis entry (ADR-026).
//
// Uses scripts/lib/audit-chain-ref.mjs (plain node:crypto), not the app's
// src/lib/audit-chain.ts, so it is a real cross-check: both implementations
// must reproduce src/lib/audit-chain.vectors.json.
//
// Usage (from the repo root, DB running):
//   pnpm audit:verify                    # chain + legacy digest
//   pnpm audit:verify --onchain          # also check the legacy digest's Polygon anchor
//   node apps/web/scripts/verify-audit-chain.mjs --self-test   # test vectors only
// Exit code 0 = intact, 1 = broken, 2 = error.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENESIS_PREV_HASH,
  LEGACY_GENESIS_ACTION,
  LEGACY_GENESIS_ANCHOR_KEY,
  entryHash,
  legacyRowsDigest,
} from "./lib/audit-chain-ref.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function selfTest() {
  const vectors = JSON.parse(readFileSync(path.join(here, "..", "src", "lib", "audit-chain.vectors.json"), "utf8"));
  let prev = GENESIS_PREV_HASH;
  for (const v of vectors) {
    if (v.prevHash !== prev) throw new Error(`vector seq ${v.seq}: prevHash does not link`);
    const h = entryHash(v);
    if (h !== v.entryHash) throw new Error(`vector seq ${v.seq}: expected ${v.entryHash}, got ${h}`);
    prev = h;
  }
  console.log(`self-test: ${vectors.length} vectors OK`);
}

function broken(msg) {
  console.error(`BROKEN: ${msg}`);
  process.exit(1);
}

async function checkLegacyAnchorOnChain(digest) {
  const { JsonRpcProvider, Network, Contract, keccak256, toUtf8Bytes } = await import("ethers");
  const deployment = JSON.parse(
    readFileSync(path.join(here, "..", "..", "..", "packages", "contracts", "deployments", "amoy.json"), "utf8")
  );
  const urls = [process.env.AMOY_RPC_URL, "https://polygon-amoy.drpc.org", "https://rpc-amoy.polygon.technology"].filter(Boolean);
  let lastErr;
  for (const url of urls) {
    const provider = new JsonRpcProvider(url, Network.from(deployment.chainId), { batchMaxCount: 1, staticNetwork: true });
    try {
      const contract = new Contract(
        deployment.address,
        ["function getAnchor(bytes32) view returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)"],
        provider
      );
      const [root, timestamp, anchoredBy] = await contract.getAnchor(keccak256(toUtf8Bytes(LEGACY_GENESIS_ANCHOR_KEY)));
      return { root: root.slice(2), timestamp: Number(timestamp), anchoredBy, matches: root.slice(2) === digest };
    } catch (err) {
      lastErr = err;
    } finally {
      provider.destroy();
    }
  }
  throw lastErr;
}

async function verifyDatabase() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.auditLog.findMany({ where: { seq: { not: null } }, orderBy: { seq: "asc" } });
    let prev = GENESIS_PREV_HASH;
    let expectedSeq = 1;
    for (const row of rows) {
      const fail = (reason) => broken(`seq ${row.seq} (row ${row.id}): ${reason}\nverified intact: seq 1..${expectedSeq - 1}`);
      if (row.seq !== expectedSeq) fail(`expected seq ${expectedSeq} — an entry is missing or reordered`);
      if (row.prevHash !== prev) fail("prevHash does not link to the previous entry");
      const h = entryHash(row);
      if (h !== row.entryHash) fail("entry contents do not match entryHash (edited after insert)");
      prev = h;
      expectedSeq++;
    }
    const head = rows.at(-1);
    console.log(
      head ? `audit chain OK: ${rows.length} entries, head seq ${head.seq} = ${head.entryHash}` : "audit chain OK: no chained entries yet"
    );

    // Pre-chain rows are covered by the genesis entry's digest (ADR-026).
    const legacy = await prisma.auditLog.findMany({ where: { seq: null } });
    const genesis = rows.find((r) => r.action === LEGACY_GENESIS_ACTION);
    if (!genesis) {
      if (legacy.length > 0) console.log(`WARNING: ${legacy.length} pre-chain rows and no ${LEGACY_GENESIS_ACTION} entry — run audit-legacy-genesis.mjs`);
      return;
    }
    const meta = genesis.targetMeta ?? {};
    const digest = legacyRowsDigest(legacy);
    if (legacy.length !== meta.legacyRowCount) {
      broken(`pre-chain rows: ${legacy.length} now, ${meta.legacyRowCount} committed at seq ${genesis.seq} — rows added or deleted`);
    }
    if (digest !== meta.legacyDigest) broken(`pre-chain rows were edited (digest ${digest} != committed ${meta.legacyDigest} at seq ${genesis.seq})`);
    console.log(`legacy rows OK: ${legacy.length} pre-chain rows match the digest committed at seq ${genesis.seq}`);

    if (process.argv.includes("--onchain")) {
      const onChain = await checkLegacyAnchorOnChain(meta.legacyDigest);
      if (!onChain.matches) broken(`legacy digest on-chain is ${onChain.root || "(none)"}, committed ${meta.legacyDigest}`);
      console.log(
        `legacy digest anchored on Polygon at ${new Date(onChain.timestamp * 1000).toISOString()} by ${onChain.anchoredBy} (tx ${meta.polygonTxHash})`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

try {
  selfTest();
  if (!process.argv.includes("--self-test")) await verifyDatabase();
} catch (err) {
  console.error(err);
  process.exit(2);
}
