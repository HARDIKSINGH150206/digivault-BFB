import { Wallet } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * One-time utility: prints ONLY the public address derived from
 * DEPLOYER_PRIVATE_KEY in packages/contracts/.env — never the key itself.
 * Lets you confirm which wallet you're about to deploy from / need to fund
 * before running scripts/deploy.ts.
 */
function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    console.error("DEPLOYER_PRIVATE_KEY not set in packages/contracts/.env");
    process.exitCode = 1;
    return;
  }
  const wallet = new Wallet(key);
  console.log(wallet.address);
}

main();
