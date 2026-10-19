import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Single source of truth for the deployed EvidenceAnchor addresses: read
 * straight from packages/contracts/deployments/*.json, never copy-pasted
 * into an env var on the server side. If a contract is ever redeployed,
 * only that JSON file needs to change.
 *
 * Two contracts (ADR-028):
 *   - v2, `<network>-v2.json` (EvidenceAnchorV2): every new anchor.
 *   - v1, `<network>.json` (EvidenceAnchor): legacy, read only — anchors
 *     written before contract v2 stay there and are still verified.
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

const cache = new Map<string, ContractDeployment>();

function baseNetwork(): string {
  return process.env.DIGIVAULT_CONTRACTS_NETWORK || "amoy";
}

/** Reads deployments/<file>.json, e.g. "amoy" (v1) or "amoy-v2". */
export function getEvidenceAnchorDeployment(file = baseNetwork()): ContractDeployment {
  const hit = cache.get(file);
  if (hit) return hit;

  const deploymentPath = path.join(process.cwd(), "..", "..", "packages", "contracts", "deployments", `${file}.json`);
  let raw: string;
  try {
    raw = readFileSync(deploymentPath, "utf8");
  } catch {
    throw new Error(
      `No EvidenceAnchor deployment record found at ${deploymentPath}. ` +
        `Run the deploy script in packages/contracts before starting the backend.`
    );
  }
  const record = JSON.parse(raw) as ContractDeployment;
  cache.set(file, record);
  return record;
}

/** The contract new anchors are written to: EvidenceAnchorV2. */
export function getAnchorTargetDeployment(): ContractDeployment {
  return getEvidenceAnchorDeployment(`${baseNetwork()}-v2`);
}

/** The legacy v1 contract (read-only). */
export function getLegacyAnchorDeployment(): ContractDeployment {
  return getEvidenceAnchorDeployment(baseNetwork());
}
