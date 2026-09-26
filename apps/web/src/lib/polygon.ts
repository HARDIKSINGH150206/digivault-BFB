import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from "ethers";
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

export function documentVersionIdToBytes32(documentVersionId: string): string {
  return keccak256(toUtf8Bytes(documentVersionId));
}

export async function anchorRootOnChain(
  documentVersionId: string,
  merkleRootHex: string
): Promise<{ txHash: string }> {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL is not set.");

  const { address } = getEvidenceAnchorDeployment();
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(readDeployerPrivateKey(), provider);
  const contract = new Contract(address, ABI, wallet);

  const tx = await contract.anchorRoot(documentVersionIdToBytes32(documentVersionId), `0x${merkleRootHex}`);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function getOnChainAnchor(
  documentVersionId: string
): Promise<{ merkleRoot: string; timestamp: number; anchoredBy: string }> {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL is not set.");

  const { address } = getEvidenceAnchorDeployment();
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(address, ABI, provider);

  const [merkleRoot, timestamp, anchoredBy] = await contract.getAnchor(
    documentVersionIdToBytes32(documentVersionId)
  );
  return { merkleRoot: merkleRoot as string, timestamp: Number(timestamp), anchoredBy: anchoredBy as string };
}
