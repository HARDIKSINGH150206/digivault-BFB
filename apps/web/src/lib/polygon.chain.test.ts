import { readFileSync } from "node:fs";
import path from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ANCHOR_V2_ABI,
  anchorAuditHeadOnChain,
  anchorOnChain,
  getAuditHeadFromTx,
  getOnChainAnchor,
  getOnChainAuditHead,
  getTxOutcome,
  type ChainConfig,
} from "./polygon";

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
        path.resolve(__dirname, "../../../../packages/contracts/artifacts/contracts/EvidenceAnchorV2.sol/EvidenceAnchorV2.json"),
        "utf8"
      )
    );
    const deployer = new Wallet(HARDHAT_KEY_0, provider);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy(deployer.address);
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
    const { txHash } = await anchorOnChain(`ok-${runId}`, root(1), null, undefined, { ...config, rpcUrls: [DEAD_RPC, RPC!] });
    expect(await getTxOutcome(txHash, config)).toBe("success");
    expect((await getOnChainAnchor(`ok-${runId}`, config)).merkleRoot).toBe(`0x${root(1)}`);
    // A tx sent elsewhere can't confirm this contract's anchor.
    expect(await getTxOutcome(txHash, { ...config, contractAddress: `0x${"1".repeat(40)}` })).toBe("unknown");
  });

  it("carries the audit head when its seq is new, and skips it (no revert) when it is not", async () => {
    const reader = new Contract(config.contractAddress, ANCHOR_V2_ABI, provider);
    const seq = Number((await reader.latestAuditHead())[0]) + 5;
    const head = root(0xaa);
    const first = await anchorOnChain(`head1-${runId}`, root(3), { seq, head }, undefined, config);
    expect(first.auditSeq).toBe(seq);
    const [onSeq, onHead] = await reader.latestAuditHead();
    expect(Number(onSeq)).toBe(seq);
    expect(onHead).toBe(`0x${head}`);
    // Same head again (e.g. no audit writes in between): document still anchors, head skipped.
    const second = await anchorOnChain(`head2-${runId}`, root(4), { seq, head }, undefined, config);
    expect(second.auditSeq).toBeNull();
    expect((await getOnChainAnchor(`head2-${runId}`, config)).merkleRoot).toBe(`0x${root(4)}`);
  });

  it("anchors a standalone audit head, reads it back from the tx, and refuses a seq that doesn't rise", async () => {
    const before = await getOnChainAuditHead(config);
    const seq = before.seq + 3;
    const head = root(0xbb);
    const { txHash, blockNumber } = await anchorAuditHeadOnChain({ seq, head }, undefined, config);
    expect(blockNumber).toBeGreaterThan(0);
    const after = await getOnChainAuditHead(config);
    expect([after.seq, after.head]).toEqual([seq, head]);
    expect(await getAuditHeadFromTx(txHash, config)).toEqual({ seq, head, timestamp: after.timestamp, blockNumber });
    // A document anchor that carried a head is read the same way; one that didn't has none.
    const carried = await anchorOnChain(`head3-${runId}`, root(5), { seq: seq + 1, head: root(0xcc) }, undefined, config);
    expect((await getAuditHeadFromTx(carried.txHash, config))?.seq).toBe(seq + 1);
    const plain = await anchorOnChain(`head4-${runId}`, root(6), null, undefined, config);
    expect(await getAuditHeadFromTx(plain.txHash, config)).toBeNull();
    // Another contract's tx proves nothing about this one.
    expect(await getAuditHeadFromTx(txHash, { ...config, contractAddress: `0x${"1".repeat(40)}` })).toBeNull();
    await expect(anchorAuditHeadOnChain({ seq, head }, undefined, config)).rejects.toThrow(/AuditSeqNotIncreasing/);
  });

  it("times out when mining is paused, reports the submitted hash, and the tx lands later", async () => {
    const id = `paused-${runId}`;
    await provider.send("evm_setAutomine", [false]);
    let submitted: string | undefined;
    try {
      await expect(
        anchorOnChain(id, root(2), null, async (h: string) => {
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
    await expect(anchorOnChain(id, root(2), null, undefined, config)).rejects.toThrow(/AlreadyAnchored/);
  });
});
