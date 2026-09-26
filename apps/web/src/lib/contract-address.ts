import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Single source of truth for the deployed EvidenceAnchor address: read
 * straight from packages/contracts/deployments/<network>.json every time,
 * never copy-pasted into an env var on the server side. If the contract is
 * ever redeployed, only that JSON file needs to change.
 */
export interface ContractDeployment {
  network: string;
  chainId: number;
  contractName: string;
  address: string;
  deployTxHash: string | null;
  deployedBy: string;
  blockNumber: number | null;
  deployedAt: string;
}

let cached: ContractDeployment | null = null;

export function getEvidenceAnchorDeployment(
  network = process.env.DIGIVAULT_CONTRACTS_NETWORK || "amoy"
): ContractDeployment {
  if (cached && cached.network === network) return cached;

  const deploymentPath = path.join(
    process.cwd(),
    "..",
    "..",
    "packages",
    "contracts",
    "deployments",
    `${network}.json`
  );

  let raw: string;
  try {
    raw = readFileSync(deploymentPath, "utf8");
  } catch {
    throw new Error(
      `No EvidenceAnchor deployment record found at ${deploymentPath}. ` +
        `Run the deploy script in packages/contracts before starting the backend.`
    );
  }

  cached = JSON.parse(raw) as ContractDeployment;
  return cached;
}
