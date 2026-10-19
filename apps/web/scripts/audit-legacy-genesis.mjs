// One-off: commit the AuditLog rows written before the hash chain existed
// (seq NULL) into the chain, and anchor that commitment (ADR-026).
//
//   1. digest = legacyRowsDigest(pre-chain rows)   (scripts/lib/audit-chain-ref.mjs)
//   2. dual anchor (CLAUDE.md rule 3):
//        MinIO   digivault-anchors/audit/legacy-genesis.json   (Object Lock, Compliance)
//        Polygon EvidenceAnchor.anchorRoot(keccak256("digivault:audit-legacy-genesis:v1"), digest)
//   3. append one chained AuditLog entry, action AUDIT_LEGACY_GENESIS, whose
//      targetMeta records the digest, row count, tx hash and MinIO URI.
//
// Idempotent: exits if the genesis entry exists. If the chain anchor already
// exists (e.g. a crash after step 2), it is reused when it matches the digest;
// pass --tx <hash> to record its transaction hash.
//
// Usage (repo root; Postgres + MinIO running; packages/contracts/.env has
// DEPLOYER_PRIVATE_KEY; AMOY_RPC_URL optional):
//   node apps/web/scripts/audit-legacy-genesis.mjs [--actor <serviceNumber>] [--dry-run] [--tx <hash>]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client as MinioClient } from "minio";
import { Contract, JsonRpcProvider, Network, Wallet, keccak256, parseUnits, toUtf8Bytes } from "ethers";
import {
  AUDIT_CHAIN_LOCK_KEY,
  GENESIS_PREV_HASH,
  LEGACY_GENESIS_ACTION,
  LEGACY_GENESIS_ANCHOR_KEY,
  entryHash,
  legacyRowsDigest,
} from "./lib/audit-chain-ref.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..", "..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, "$1")])
    );
  } catch {
    return {};
  }
}
const webEnv = { ...readEnvFile(path.join(repoRoot, "apps", "web", ".env.local")), ...process.env };

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const existing = await prisma.auditLog.findFirst({ where: { action: LEGACY_GENESIS_ACTION } });
  if (existing) {
    console.log(`Genesis entry already exists (seq ${existing.seq}). Nothing to do.`);
    process.exit(0);
  }

  const legacy = await prisma.auditLog.findMany({ where: { seq: null } });
  const digest = legacyRowsDigest(legacy);
  console.log(`pre-chain rows: ${legacy.length}\nlegacy digest: ${digest}`);
  if (legacy.length === 0) {
    console.log("No pre-chain rows — no genesis entry needed.");
    process.exit(0);
  }

  const actor = arg("--actor")
    ? await prisma.user.findUnique({ where: { serviceNumber: arg("--actor") } })
    : await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!actor) throw new Error("No actor: pass --actor <serviceNumber> of an ADMIN user.");
  console.log(`actor: ${actor.serviceNumber ?? actor.id} (${actor.role})`);
  if (dryRun) {
    console.log("--dry-run: stopping before anchoring.");
    process.exit(0);
  }

  // --- MinIO, Object Lock (Compliance) --------------------------------------
  const minio = new MinioClient({
    endPoint: webEnv.MINIO_ENDPOINT ?? "localhost",
    port: Number(webEnv.MINIO_PORT ?? 9000),
    useSSL: false,
    accessKey: webEnv.MINIO_ACCESS_KEY ?? "digivault",
    secretKey: webEnv.MINIO_SECRET_KEY ?? "digivault123",
  });
  const bucket = webEnv.MINIO_ANCHOR_BUCKET ?? "digivault-anchors";
  const lock = await minio.getObjectLockConfig(bucket).catch(() => null);
  if (lock?.objectLockEnabled !== "Enabled" || lock?.mode !== "COMPLIANCE") {
    throw new Error(`Bucket ${bucket} must exist with Object Lock (Compliance). Anchor any document once to create it.`);
  }
  const record = Buffer.from(
    JSON.stringify({ kind: "audit-legacy-genesis", legacyRowCount: legacy.length, legacyDigest: digest, anchorKey: LEGACY_GENESIS_ANCHOR_KEY }, null, 2)
  );
  const objectKey = "audit/legacy-genesis.json";
  const { versionId } = await minio.putObject(bucket, objectKey, record, record.byteLength, { "Content-Type": "application/json" });
  const retention = await minio.getObjectRetention(bucket, objectKey, { versionId });
  if (retention?.mode !== "COMPLIANCE") throw new Error(`Object Lock not applied to ${bucket}/${objectKey}.`);
  const objectLockUri = `s3://${bucket}/${objectKey}?versionId=${versionId}`;
  console.log(`MinIO: ${objectLockUri} (retained until ${retention.retainUntilDate})`);

  // --- Polygon ----------------------------------------------------------------
  const deployment = JSON.parse(readFileSync(path.join(repoRoot, "packages", "contracts", "deployments", "amoy.json"), "utf8"));
  const key = readEnvFile(path.join(repoRoot, "packages", "contracts", ".env")).DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY missing from packages/contracts/.env");
  const abi = [
    "function anchorRoot(bytes32 documentVersionId, bytes32 merkleRoot) external",
    "function getAnchor(bytes32) view returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)",
  ];
  const anchorKey = keccak256(toUtf8Bytes(LEGACY_GENESIS_ANCHOR_KEY));
  const urls = [...new Set([webEnv.AMOY_RPC_URL, "https://polygon-amoy.drpc.org", "https://rpc-amoy.polygon.technology"].filter(Boolean))];

  let polygonTxHash = arg("--tx");
  for (const url of urls) {
    const provider = new JsonRpcProvider(url, Network.from(deployment.chainId), { batchMaxCount: 1, staticNetwork: true });
    try {
      const contract = new Contract(deployment.address, abi, new Wallet(key, provider));
      const [root, timestamp] = await contract.getAnchor(anchorKey);
      if (Number(timestamp) !== 0) {
        if (root.slice(2) !== digest) throw new Error(`Chain already holds a DIFFERENT legacy digest (${root}). Investigate before continuing.`);
        if (!polygonTxHash) throw new Error("Legacy digest is already anchored; re-run with --tx <hash> of that transaction.");
        console.log(`Polygon: already anchored, using tx ${polygonTxHash}`);
        break;
      }
      const fee = await provider.getFeeData();
      const capMax = parseUnits(webEnv.ANCHOR_MAX_FEE_GWEI || "100", "gwei");
      const capPrio = parseUnits(webEnv.ANCHOR_MAX_PRIORITY_FEE_GWEI || "30", "gwei");
      const prio = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas < capPrio ? fee.maxPriorityFeePerGas : capPrio;
      let maxFee = fee.maxFeePerGas && fee.maxFeePerGas < capMax ? fee.maxFeePerGas : capMax;
      if (maxFee < prio) maxFee = prio;
      const tx = await contract.anchorRoot(anchorKey, `0x${digest}`, { maxFeePerGas: maxFee, maxPriorityFeePerGas: prio });
      console.log(`Polygon: sent ${tx.hash} via ${url}, waiting for receipt...`);
      const receipt = await tx.wait(1, 180_000);
      if (receipt?.status !== 1) throw new Error(`tx ${tx.hash} failed`);
      polygonTxHash = receipt.hash;
      console.log(`Polygon: anchored in block ${receipt.blockNumber}`);
      break;
    } catch (err) {
      const transport = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed|SERVER_ERROR/.test(`${err.code} ${err.message}`);
      if (!transport || url === urls.at(-1) || polygonTxHash) throw err;
      console.warn(`RPC ${url} failed (${err.message.slice(0, 100)}), trying next`);
    } finally {
      provider.destroy();
    }
  }

  // --- Chained audit entry ----------------------------------------------------
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);
    const last = await tx.auditLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: "desc" }, select: { seq: true, entryHash: true } });
    const entry = {
      actorId: actor.id,
      action: LEGACY_GENESIS_ACTION,
      targetId: "AuditLog",
      targetType: "AuditLog",
      targetMeta: {
        legacyRowCount: legacy.length,
        legacyDigest: digest,
        ordering: "timestamp asc, id asc",
        anchorKey: LEGACY_GENESIS_ANCHOR_KEY,
        contractAddress: deployment.address,
        polygonTxHash,
        objectLockUri,
      },
      sourceIp: "system:audit-legacy-genesis",
      timestamp: new Date(),
      seq: (last?.seq ?? 0) + 1,
      prevHash: last?.entryHash ?? GENESIS_PREV_HASH,
    };
    return tx.auditLog.create({ data: { ...entry, entryHash: entryHash(entry) } });
  });
  console.log(`Genesis audit entry written: seq ${created.seq}, entryHash ${created.entryHash}`);
} finally {
  await prisma.$disconnect();
}
