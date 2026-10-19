import { readFileSync } from "node:fs";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import { anchorRootOnChain, getOnChainAnchor, getTxOutcome, type ChainConfig } from "./polygon";

// Integration test against a local Hardhat node — never a public chain.
// Skipped unless LOCAL_CHAIN_RPC is set. Run with:
//   pnpm --filter @digivault/contracts exec hardhat node     (terminal 1)
//   pnpm --filter @digivault/web test:chain                  (terminal 2)
const RPC = process.env.LOCAL_CHAIN_RPC;
// Hardhat's publicly known test account #0 (also in packages/contracts/hardhat.config.ts).
const HARDHAT_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEAD_RPC = "http://127.0.0.1:1";

describe.skipIf(!RPC)("anchoring against a local chain", () => {
  let provider: JsonRpcProvider;
  let config: ChainConfig;
  const root = (n: number) => n.toString(16).padStart(64, "0");
  const runId = Date.now().toString(36);

  beforeAll(async () => {
    provider = new JsonRpcProvider(RPC);
    await provider.send("evm_setAutomine", [true]);
    const artifact = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../../../packages/contracts/artifacts/contracts/EvidenceAnchor.sol/EvidenceAnchor.json"),
        "utf8"
      )
    );
    const deployer = new Wallet(HARDHAT_KEY_0, provider);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy();
    await contract.waitForDeployment();
    config = {
      rpcUrls: [RPC!],
      chainId: Number((await provider.getNetwork()).chainId),
      contractAddress: await contract.getAddress(),
      privateKey: () => HARDHAT_KEY_0,
      confirmTimeoutMs: 2_000,
    };
  });

  it("anchors normally, and falls back past a dead RPC", async () => {
    const { txHash } = await anchorRootOnChain(`ok-${runId}`, root(1), undefined, { ...config, rpcUrls: [DEAD_RPC, RPC!] });
    expect(await getTxOutcome(txHash, config)).toBe("success");
    expect((await getOnChainAnchor(`ok-${runId}`, config)).merkleRoot).toBe(`0x${root(1)}`);
  });

  it("times out when mining is paused, reports the submitted hash, and the tx lands later", async () => {
    const id = `paused-${runId}`;
    await provider.send("evm_setAutomine", [false]);
    let submitted: string | undefined;
    try {
      await expect(
        anchorRootOnChain(id, root(2), async (h) => {
          submitted = h;
        }, config)
      ).rejects.toThrow(/not confirmed within 2000 ms/);

      expect(submitted).toMatch(/^0x[0-9a-f]{64}$/);
      expect(await getTxOutcome(submitted!, config)).toBe("unknown");
      expect((await getOnChainAnchor(id, config)).timestamp).toBe(0);

      await provider.send("evm_mine", []);
    } finally {
      await provider.send("evm_setAutomine", [true]);
    }

    // The "lost" tx is now mined: this is exactly the state lib/anchor.ts
    // reconciles (submittedTxHash recorded, on-chain root matches).
    expect(await getTxOutcome(submitted!, config)).toBe("success");
    const onChain = await getOnChainAnchor(id, config);
    expect(onChain.merkleRoot).toBe(`0x${root(2)}`);
    expect(onChain.timestamp).toBeGreaterThan(0);

    // ...and a naive re-send is refused by the contract, which is why a
    // retry must reconcile instead of sending again.
    await expect(anchorRootOnChain(id, root(2), undefined, config)).rejects.toThrow(/already anchored/);
  });
});
