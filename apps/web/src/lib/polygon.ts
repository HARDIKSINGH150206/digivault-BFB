import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes, parseUnits } from "ethers";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getEvidenceAnchorDeployment } from "./contract-address";

const ABI = [
  "function anchorRoot(bytes32 documentVersionId, bytes32 merkleRoot) external",
  "function getAnchor(bytes32 documentVersionId) external view returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)",
];

/**
 * The contract only accepts anchorRoot() calls from its `owner` (see
 * EvidenceAnchor.sol), i.e. the same account that deployed it. Rather than
 * duplicating that private key into apps/web's own .env, this reads it
 * straight from packages/contracts/.env — one signer key, one place it
 * lives, same principle as the contract-address single-source-of-truth
 * rule above it.
 */
function readDeployerPrivateKey(): string {
  const envPath = path.join(process.cwd(), "..", "..", "packages", "contracts", ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(`Could not read ${envPath} for DEPLOYER_PRIVATE_KEY.`);
  }
  const match = contents.match(/^DEPLOYER_PRIVATE_KEY=(.+)$/m);
  if (!match) throw new Error(`DEPLOYER_PRIVATE_KEY not found in ${envPath}.`);
  return match[1].trim();
}

/**
 * No JSON-RPC batching: free public Amoy endpoints (e.g. drpc) reject
 * batches of more than 3 calls, and getFeeData() alone fans out into
 * several concurrent calls that ethers would otherwise batch.
 */
function rpcProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
}

export function documentVersionIdToBytes32(documentVersionId: string): string {
  return keccak256(toUtf8Bytes(documentVersionId));
}

export interface FeeCaps {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Upper bounds for anchoring tx fees, from ANCHOR_MAX_FEE_GWEI /
 * ANCHOR_MAX_PRIORITY_FEE_GWEI (defaults 100 / 60 gwei). An anchor uses
 * ~104k gas, so the defaults bound one anchor at ~0.0104 POL. The RPC's
 * fee suggestion has at times been 500 gwei, i.e. a ~0.05 POL pre-flight
 * balance requirement for a tx that actually costs ~0.003.
 */
export function anchorFeeCaps(env: Record<string, string | undefined> = process.env): FeeCaps {
  const maxFee = parseUnits(env.ANCHOR_MAX_FEE_GWEI || "100", "gwei");
  const maxPriority = parseUnits(env.ANCHOR_MAX_PRIORITY_FEE_GWEI || "60", "gwei");
  if (maxPriority > maxFee) throw new Error("ANCHOR_MAX_PRIORITY_FEE_GWEI must not exceed ANCHOR_MAX_FEE_GWEI.");
  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPriority };
}

/** The RPC's EIP-1559 suggestion, clamped to the caps. Never raises a fee above what was suggested. */
export function capFees(
  suggested: { maxFeePerGas: bigint | null; maxPriorityFeePerGas: bigint | null },
  caps: FeeCaps
): FeeCaps {
  const min = (a: bigint, b: bigint) => (a < b ? a : b);
  const priority = min(suggested.maxPriorityFeePerGas ?? caps.maxPriorityFeePerGas, caps.maxPriorityFeePerGas);
  const maxFee = min(suggested.maxFeePerGas ?? caps.maxFeePerGas, caps.maxFeePerGas);
  return { maxPriorityFeePerGas: priority, maxFeePerGas: maxFee < priority ? priority : maxFee };
}

/** How long to wait for a receipt before reporting failure (the tx may still land; see lib/anchor.ts). */
const CONFIRM_TIMEOUT_MS = Number(process.env.ANCHOR_CONFIRM_TIMEOUT_MS || 180_000);

export async function anchorRootOnChain(
  documentVersionId: string,
  merkleRootHex: string,
  onSubmitted?: (txHash: string) => Promise<void>
): Promise<{ txHash: string }> {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL is not set.");

  const { address } = getEvidenceAnchorDeployment();
  const provider = rpcProvider(rpcUrl);
  const wallet = new Wallet(readDeployerPrivateKey(), provider);
  const contract = new Contract(address, ABI, wallet);

  const fees = capFees(await provider.getFeeData(), anchorFeeCaps());
  const tx = await contract.anchorRoot(documentVersionIdToBytes32(documentVersionId), `0x${merkleRootHex}`, fees);
  if (onSubmitted) await onSubmitted(tx.hash).catch((err) => console.error("[polygon] onSubmitted failed:", err));
  const receipt = await tx.wait(1, CONFIRM_TIMEOUT_MS);
  if (!receipt || receipt.status !== 1) throw new Error(`Anchor tx ${tx.hash} reverted or returned no receipt.`);
  return { txHash: receipt.hash };
}

/** Status of a previously sent tx: "success", "reverted", or "unknown" (not mined / not found). */
export async function getTxOutcome(txHash: string): Promise<"success" | "reverted" | "unknown"> {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL is not set.");
  const receipt = await rpcProvider(rpcUrl).getTransactionReceipt(txHash);
  if (!receipt) return "unknown";
  return receipt.status === 1 ? "success" : "reverted";
}

export async function getOnChainAnchor(
  documentVersionId: string
): Promise<{ merkleRoot: string; timestamp: number; anchoredBy: string }> {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL is not set.");

  const { address } = getEvidenceAnchorDeployment();
  const provider = rpcProvider(rpcUrl);
  const contract = new Contract(address, ABI, provider);

  const [merkleRoot, timestamp, anchoredBy] = await contract.getAnchor(
    documentVersionIdToBytes32(documentVersionId)
  );
  return { merkleRoot: merkleRoot as string, timestamp: Number(timestamp), anchoredBy: anchoredBy as string };
}
