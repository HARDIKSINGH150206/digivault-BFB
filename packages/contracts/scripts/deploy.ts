import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys EvidenceAnchor.sol and records the result in
 * packages/contracts/deployments/<network>.json for the backend to read
 * the contract address from later (docs/04-api-spec.md's verify-proof
 * contract_address field).
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account configured — check DEPLOYER_PRIVATE_KEY in packages/contracts/.env"
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} POL`);

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 POL on ${network.name} — fund it from an Amoy faucet before deploying.`
    );
  }

  const Factory = await ethers.getContractFactory("EvidenceAnchor");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;
  const net = await ethers.provider.getNetwork();

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    contractName: "EvidenceAnchor",
    address,
    deployTxHash: deployTx?.hash ?? null,
    deployedBy: deployer.address,
    blockNumber: receipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\nEvidenceAnchor deployed to: ${address}`);
  console.log(`Tx hash: ${deployTx?.hash}`);
  console.log(`Record written to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
