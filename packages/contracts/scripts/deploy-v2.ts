import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys EvidenceAnchorV2 (ADR-019, ADR-028) and records it in
 * deployments/<network>-v2.json. The v1 record (<network>.json) is left
 * untouched: v1 stays the read-only legacy contract.
 *
 * The first anchorer is FIRST_ANCHORER, or the deployer when unset. Fees
 * are the RPC suggestion clamped to DEPLOY_MAX_FEE_GWEI /
 * DEPLOY_MAX_PRIORITY_FEE_GWEI (defaults 100 / 30), the same caps the app
 * uses for anchoring (ADR-025).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account configured — check DEPLOYER_PRIVATE_KEY in packages/contracts/.env");

  const outPath = path.join(__dirname, "..", "deployments", `${network.name}-v2.json`);
  if (fs.existsSync(outPath) && !process.env.FORCE_REDEPLOY) {
    throw new Error(`${outPath} already exists. Set FORCE_REDEPLOY=1 to deploy another instance.`);
  }

  const firstAnchorer = process.env.FIRST_ANCHORER || deployer.address;
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} POL`);
  console.log(`First anchorer: ${firstAnchorer}`);
  if (balance === 0n) throw new Error(`Deployer has 0 POL on ${network.name}.`);

  const caps = {
    maxFeePerGas: ethers.parseUnits(process.env.DEPLOY_MAX_FEE_GWEI || "100", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits(process.env.DEPLOY_MAX_PRIORITY_FEE_GWEI || "30", "gwei"),
  };
  const suggested = await ethers.provider.getFeeData();
  const min = (a: bigint | null, b: bigint) => (a !== null && a < b ? a : b);
  const priority = min(suggested.maxPriorityFeePerGas, caps.maxPriorityFeePerGas);
  let maxFee = min(suggested.maxFeePerGas, caps.maxFeePerGas);
  if (maxFee < priority) maxFee = priority;

  const Factory = await ethers.getContractFactory("EvidenceAnchorV2");
  const contract = await Factory.deploy(firstAnchorer, { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority });
  const deployTx = contract.deploymentTransaction();
  console.log(`Deploy tx: ${deployTx?.hash}`);
  await contract.waitForDeployment();
  const receipt = deployTx ? await deployTx.wait() : null;
  const address = await contract.getAddress();
  const net = await ethers.provider.getNetwork();

  if (!(await contract.isAnchorer(firstAnchorer))) throw new Error("First anchorer is not on the allow-list after deploy.");

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    contractName: "EvidenceAnchorV2",
    address,
    deployTxHash: deployTx?.hash ?? null,
    deployedBy: deployer.address,
    firstAnchorer,
    blockNumber: receipt?.blockNumber ?? null,
    gasUsed: receipt ? Number(receipt.gasUsed) : null,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\nEvidenceAnchorV2 deployed to: ${address}`);
  console.log(`Gas used: ${record.gasUsed}`);
  console.log(`Record written to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
