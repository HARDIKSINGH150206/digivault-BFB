// Independent verifier for the AuditLog hash chain (ADR-020) and the
// legacy-rows genesis entry (ADR-026).
//
// Uses scripts/lib/audit-chain-ref.mjs (plain node:crypto), not the app's
// src/lib/audit-chain.ts, so it is a real cross-check: both implementations
// must reproduce src/lib/audit-chain.vectors.json.
//
// Usage (from the repo root, DB running):
//   pnpm audit:verify                    # chain + legacy digest
//   pnpm audit:verify --onchain          # also check the anchored audit heads and the
//                                        # legacy digest on Polygon (docs/07 Phase 4)
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

function readDeployment(file) {
  return JSON.parse(readFileSync(path.join(here, "..", "..", "..", "packages", "contracts", "deployments", file), "utf8"));
}

function rpcUrls() {
  return [process.env.AMOY_RPC_URL, "https://polygon-amoy.drpc.org", "https://rpc-amoy.polygon.technology"].filter(Boolean);
}

/** Runs fn with a provider for each RPC URL in turn until one answers. */
async function withProvider(chainId, fn) {
  const { JsonRpcProvider, Network } = await import("ethers");
  let lastErr;
  for (const url of rpcUrls()) {
    const provider = new JsonRpcProvider(url, Network.from(chainId), { batchMaxCount: 1, staticNetwork: true });
    try {
      return await fn(provider);
    } catch (err) {
      lastErr = err;
    } finally {
      provider.destroy();
    }
  }
  throw lastErr;
}

/**
 * docs/07 Phase 4: every audit head anchored on EvidenceAnchorV2 must equal
 * the entryHash at its seq in the database. The chain check above catches
 * an edited row; this catches a rewrite that recomputed every hash after
 * it. Heads come from the contract itself (latestAuditHead) and from the
 * AuditHeadAnchored events of every tx we recorded (standalone heads and
 * heads carried by document anchors). AUDIT_ANCHOR_CONTRACT and
 * AMOY_RPC_URL override the deployment (local-chain tests only).
 */
async function checkAnchoredHeads(prisma, entryHashAt, headSeq) {
  const { Contract, Interface } = await import("ethers");
  const deployment = readDeployment("amoy-v2.json");
  const address = (process.env.AUDIT_ANCHOR_CONTRACT ?? deployment.address).toLowerCase();
  const abi = [
    "function latestAuditHead() view returns (uint64 seq, bytes32 head, uint256 timestamp)",
    "event AuditHeadAnchored(uint64 indexed seq, bytes32 head, uint256 timestamp, address indexed anchoredBy)",
  ];
  const iface = new Interface(abi);

  const standalone = await prisma.auditHeadAnchor.findMany({ where: { OR: [{ polygonTxHash: { not: null } }, { submittedTxHash: { not: null } }] } });
  const carried = await prisma.anchorLog.findMany({ where: { auditSeq: { not: null }, polygonTxHash: { not: null } } });
  const txs = [...new Set([...standalone.map((a) => a.polygonTxHash ?? a.submittedTxHash), ...carried.map((a) => a.polygonTxHash)])];

  const heads = await withProvider(deployment.chainId, async (provider) => {
    const found = [];
    const [seq, head, timestamp] = await new Contract(address, abi, provider).latestAuditHead();
    if (seq > 0n) found.push({ seq: Number(seq), head: head.slice(2), timestamp: Number(timestamp), source: "latestAuditHead()" });
    for (const tx of txs) {
      const receipt = await provider.getTransactionReceipt(tx);
      if (!receipt || receipt.status !== 1 || (receipt.to ?? "").toLowerCase() !== address) continue;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== address) continue;
        const parsed = (() => {
          try {
            return iface.parseLog(log);
          } catch {
            return null;
          }
        })();
        if (parsed?.name === "AuditHeadAnchored") {
          found.push({ seq: Number(parsed.args.seq), head: parsed.args.head.slice(2), timestamp: Number(parsed.args.timestamp), block: receipt.blockNumber, tx });
        }
      }
    }
    return found;
  });

  if (heads.length === 0) {
    console.log("audit heads: none anchored on chain yet");
    return;
  }
  // Ascending seq; one entry per seq, preferring one that names its block.
  const bySeq = new Map();
  for (const h of heads) if (!bySeq.has(h.seq) || h.block !== undefined) bySeq.set(h.seq, { ...bySeq.get(h.seq), ...h });
  const ordered = [...bySeq.values()].sort((a, b) => a.seq - b.seq);

  let lastGood = 0;
  for (const h of ordered) {
    if (h.seq > headSeq) broken(`audit head seq ${h.seq} is anchored on chain, but the database ends at seq ${headSeq} — entries were deleted`);
    if (entryHashAt(h.seq) !== h.head) {
      broken(
        `entry #${h.seq} does not match the head anchored on chain${h.block ? ` in block ${h.block}` : ""} ` +
          `(${h.head} on chain, ${entryHashAt(h.seq)} in the database).\n` +
          `The chain was rewritten: the first bad entry is between seq ${lastGood + 1} and ${h.seq}; seq 1..${lastGood} match their anchors.`
      );
    }
    lastGood = h.seq;
  }
  const top = ordered.at(-1);
  console.log(
    `audit log verified up to entry #${top.seq}, anchored ${top.block ? `in block ${top.block}` : "on chain"} ` +
      `(${new Date(top.timestamp * 1000).toISOString()}); ${ordered.length} anchored head(s) checked`
  );
  if (headSeq > top.seq) {
    console.log(`  ${headSeq - top.seq} newer entr${headSeq - top.seq === 1 ? "y is" : "ies are"} hash-chained but not anchored yet`);
  }
}

async function checkLegacyAnchorOnChain(digest) {
  const { JsonRpcProvider, Network, Contract, keccak256, toUtf8Bytes } = await import("ethers");
  const deployment = readDeployment("amoy.json");
  const urls = rpcUrls();
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
    if (process.argv.includes("--onchain")) {
      const bySeq = new Map(rows.map((r) => [r.seq, r.entryHash]));
      await checkAnchoredHeads(prisma, (seq) => bySeq.get(seq) ?? null, head?.seq ?? 0);
    }

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
