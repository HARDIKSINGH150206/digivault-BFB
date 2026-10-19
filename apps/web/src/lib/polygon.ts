import { JsonRpcProvider, Network, Wallet, Contract, keccak256, toUtf8Bytes, parseUnits } from "ethers";
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

export const DEFAULT_FALLBACK_RPC_URLS = ["https://rpc-amoy.polygon.technology"];

/**
 * Where and how to talk to the chain. Production code uses
 * defaultChainConfig(); tests pass their own (e.g. a local Hardhat node).
 */
export interface ChainConfig {
  /** Tried in order; the next one is used only after a transport-level failure. */
  rpcUrls: string[];
  chainId: number;
  contractAddress: string;
  privateKey: () => string;
  confirmTimeoutMs: number;
}

/** RPC list: AMOY_RPC_URL first, then AMOY_RPC_FALLBACK_URLS (comma-separated; default rpc-amoy.polygon.technology). */
export function rpcUrlsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const fallbacks = env.AMOY_RPC_FALLBACK_URLS !== undefined ? env.AMOY_RPC_FALLBACK_URLS.split(",") : DEFAULT_FALLBACK_RPC_URLS;
  const urls = [env.AMOY_RPC_URL ?? "", ...fallbacks].map((u) => u.trim()).filter(Boolean);
  return [...new Set(urls)];
}

export function defaultChainConfig(): ChainConfig {
  const { address, chainId } = getEvidenceAnchorDeployment();
  return {
    rpcUrls: rpcUrlsFromEnv(),
    chainId,
    contractAddress: address,
    privateKey: readDeployerPrivateKey,
    confirmTimeoutMs: Number(process.env.ANCHOR_CONFIRM_TIMEOUT_MS || 180_000),
  };
}

/**
 * No JSON-RPC batching: free public Amoy endpoints (e.g. drpc) reject
 * batches of more than 3 calls, and getFeeData() alone fans out into
 * several concurrent calls that ethers would otherwise batch. Static
 * network: no background chain detection, so a dead endpoint fails fast
 * instead of retrying forever.
 */
function rpcProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl, Network.from(chainId), { batchMaxCount: 1, staticNetwork: true });
}

/** Errors that mean "this endpoint didn't answer properly", as opposed to a real chain-level answer. */
export function isTransportError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } } | null;
  if (!e) return false;
  if (e.code && ["SERVER_ERROR", "NETWORK_ERROR", "TIMEOUT", "BAD_DATA"].includes(e.code)) return true;
  const text = `${e.cause?.code ?? ""} ${e.message ?? ""}`;
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|wrong chain/i.test(text);
}

/**
 * Runs fn against each RPC URL in turn until one answers. Falls through to
 * the next URL only on a transport error, and only while `canRetry()` is
 * true — once a tx has been broadcast, retrying elsewhere could double-send.
 */
export async function withRpcFallback<T>(
  urls: string[],
  chainId: number,
  fn: (provider: JsonRpcProvider) => Promise<T>,
  canRetry: () => boolean = () => true
): Promise<T> {
  if (urls.length === 0) throw new Error("No RPC URL configured (AMOY_RPC_URL / AMOY_RPC_FALLBACK_URLS).");
  let lastErr: unknown;
  for (const [i, url] of urls.entries()) {
    const provider = rpcProvider(url, chainId);
    try {
      const reported = Number(await provider.send("eth_chainId", []));
      if (reported !== chainId) throw new Error(`RPC ${url} is on the wrong chain (chainId ${reported}, expected ${chainId}).`);
      return await fn(provider);
    } catch (err) {
      lastErr = err;
      const more = i < urls.length - 1;
      if (!more || !isTransportError(err) || !canRetry()) throw err;
      console.warn(`[polygon] RPC ${url} failed (${(err as Error).message?.slice(0, 120)}), trying next endpoint`);
    } finally {
      provider.destroy();
    }
  }
  throw lastErr;
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
 * ANCHOR_MAX_PRIORITY_FEE_GWEI (defaults 100 / 30 gwei). An anchor uses
 * ~104k gas: 30 gwei priority ≈ 0.003 POL per anchor (Amoy's minimum
 * priority fee is ~25 gwei). The RPC's fee suggestion has at times been
 * 500 gwei, i.e. a ~0.05 POL pre-flight balance requirement.
 */
export function anchorFeeCaps(env: Record<string, string | undefined> = process.env): FeeCaps {
  const maxFee = parseUnits(env.ANCHOR_MAX_FEE_GWEI || "100", "gwei");
  const maxPriority = parseUnits(env.ANCHOR_MAX_PRIORITY_FEE_GWEI || "30", "gwei");
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

/**
 * Sends anchorRoot(keccak256(id), root). `id` is normally a document
 * version ID; scripts/audit-legacy-genesis.mjs uses its own namespaced key.
 * Waits at most confirmTimeoutMs for the receipt; on timeout the tx may
 * still land later, which lib/anchor.ts reconciles on retry.
 */
export async function anchorRootOnChain(
  documentVersionId: string,
  merkleRootHex: string,
  onSubmitted?: (txHash: string) => Promise<void>,
  config: ChainConfig = defaultChainConfig()
): Promise<{ txHash: string }> {
  let submitted = false;
  return withRpcFallback(
    config.rpcUrls,
    config.chainId,
    async (provider) => {
      const wallet = new Wallet(config.privateKey(), provider);
      const contract = new Contract(config.contractAddress, ABI, wallet);
      const fees = capFees(await provider.getFeeData(), anchorFeeCaps());
      const tx = await contract.anchorRoot(documentVersionIdToBytes32(documentVersionId), `0x${merkleRootHex}`, fees);
      submitted = true;
      if (onSubmitted) await onSubmitted(tx.hash).catch((err) => console.error("[polygon] onSubmitted failed:", err));
      let receipt;
      try {
        receipt = await tx.wait(1, config.confirmTimeoutMs);
      } catch (err) {
        if ((err as { code?: string }).code === "TIMEOUT") {
          throw new Error(
            `Anchor tx ${tx.hash} not confirmed within ${config.confirmTimeoutMs} ms. It may still be mined; ` +
              "retrying the anchor will detect it without sending again."
          );
        }
        throw err;
      }
      if (!receipt || receipt.status !== 1) throw new Error(`Anchor tx ${tx.hash} reverted or returned no receipt.`);
      return { txHash: receipt.hash };
    },
    () => !submitted
  );
}

/** Status of a previously sent tx: "success", "reverted", or "unknown" (not mined / not found). */
export async function getTxOutcome(
  txHash: string,
  config: ChainConfig = defaultChainConfig()
): Promise<"success" | "reverted" | "unknown"> {
  return withRpcFallback(config.rpcUrls, config.chainId, async (provider) => {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return "unknown";
    return receipt.status === 1 ? "success" : "reverted";
  });
}

export async function getOnChainAnchor(
  documentVersionId: string,
  config: ChainConfig = defaultChainConfig()
): Promise<{ merkleRoot: string; timestamp: number; anchoredBy: string }> {
  return withRpcFallback(config.rpcUrls, config.chainId, async (provider) => {
    const contract = new Contract(config.contractAddress, ABI, provider);
    const [merkleRoot, timestamp, anchoredBy] = await contract.getAnchor(documentVersionIdToBytes32(documentVersionId));
    return { merkleRoot: merkleRoot as string, timestamp: Number(timestamp), anchoredBy: anchoredBy as string };
  });
}
