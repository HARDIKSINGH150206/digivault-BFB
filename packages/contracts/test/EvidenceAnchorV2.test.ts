import assert from "node:assert/strict";
import { ethers, network } from "hardhat";

// Runs on Hardhat's in-process chain only (`pnpm --filter @digivault/contracts test`).

const id = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
const C1 = id("commitment-1");
const C2 = id("commitment-2");
const HEAD = (n: number) => id(`audit-head-${n}`);

async function deploy(anchorer?: string) {
  const [owner, anchorer2, stranger, nextOwner] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("EvidenceAnchorV2");
  const contract = await Factory.deploy(anchorer ?? owner.address);
  await contract.waitForDeployment();
  return { contract, owner, anchorer2, stranger, nextOwner };
}

async function revertsWith(p: Promise<unknown>, error: string) {
  await assert.rejects(p, (err: Error) => {
    assert.match(err.message, new RegExp(`custom error '${error}`), err.message);
    return true;
  });
}

async function now(): Promise<number> {
  return (await ethers.provider.getBlock("latest"))!.timestamp;
}

describe("EvidenceAnchorV2", () => {
  describe("anchoring", () => {
    it("anchors once, emits DocumentAnchored, and refuses a re-anchor", async () => {
      const { contract, owner } = await deploy();
      const tx = await contract.anchor(id("doc-1"), C1, 0, ethers.ZeroHash);
      const receipt = await tx.wait();
      const ev = receipt!.logs.map((l) => contract.interface.parseLog(l)).find((p) => p?.name === "DocumentAnchored");
      assert.equal(ev?.args.docId, id("doc-1"));
      assert.equal(ev?.args.commitment, C1);
      assert.equal(ev?.args.anchoredBy, owner.address);

      const [commitment, timestamp, by] = await contract.getAnchor(id("doc-1"));
      assert.equal(commitment, C1);
      assert.ok(timestamp > 0n);
      assert.equal(by, owner.address);

      await revertsWith(contract.anchor(id("doc-1"), C2, 0, ethers.ZeroHash), "AlreadyAnchored");
      await revertsWith(contract.anchor(id("doc-1"), C1, 0, ethers.ZeroHash), "AlreadyAnchored");
    });

    it("rejects a zero commitment", async () => {
      const { contract } = await deploy();
      await revertsWith(contract.anchor(id("doc"), ethers.ZeroHash, 0, ethers.ZeroHash), "ZeroValue");
    });

    it("rejects a non-anchorer, including the owner once it is not on the list", async () => {
      const { contract, anchorer2, stranger } = await deploy();
      await revertsWith(contract.connect(stranger).anchor(id("doc"), C1, 0, ethers.ZeroHash), "NotAnchorer");
      // Owner and anchorer are separate roles.
      const separate = await deploy(anchorer2.address);
      await revertsWith(separate.contract.anchor(id("doc"), C1, 0, ethers.ZeroHash), "NotAnchorer");
      await separate.contract.connect(anchorer2).anchor(id("doc"), C1, 0, ethers.ZeroHash);
    });

    it("verify() is true only for the exact commitment of an anchored doc", async () => {
      const { contract } = await deploy();
      await contract.anchor(id("doc"), C1, 0, ethers.ZeroHash);
      assert.equal(await contract.verify(id("doc"), C1), true);
      assert.equal(await contract.verify(id("doc"), C2), false);
      assert.equal(await contract.verify(id("other"), C1), false);
      assert.equal(await contract.verify(id("other"), ethers.ZeroHash), false);
    });
  });

  describe("audit heads", () => {
    it("records the head carried by a document anchor and emits both events in one tx", async () => {
      const { contract } = await deploy();
      const receipt = await (await contract.anchor(id("doc"), C1, 7, HEAD(7))).wait();
      const names = receipt!.logs.map((l) => contract.interface.parseLog(l)?.name);
      assert.deepEqual(names, ["DocumentAnchored", "AuditHeadAnchored"]);
      const [seq, head, ts] = await contract.latestAuditHead();
      assert.equal(seq, 7n);
      assert.equal(head, HEAD(7));
      assert.ok(ts > 0n);
    });

    it("requires seq to increase strictly, both standalone and with a document", async () => {
      const { contract } = await deploy();
      await contract.anchorAuditHead(5, HEAD(5));
      await revertsWith(contract.anchorAuditHead(5, HEAD(5)), "AuditSeqNotIncreasing");
      await revertsWith(contract.anchorAuditHead(4, HEAD(4)), "AuditSeqNotIncreasing");
      await revertsWith(contract.anchor(id("doc"), C1, 5, HEAD(5)), "AuditSeqNotIncreasing");
      await contract.anchorAuditHead(6, HEAD(6));
      assert.equal((await contract.latestAuditHead())[0], 6n);
    });

    it("seq 0 on a document anchor means no head; standalone seq 0 and a zero head are refused", async () => {
      const { contract } = await deploy();
      await contract.anchor(id("doc"), C1, 0, ethers.ZeroHash);
      assert.equal((await contract.latestAuditHead())[0], 0n);
      await revertsWith(contract.anchorAuditHead(0, HEAD(0)), "ZeroValue");
      await revertsWith(contract.anchorAuditHead(1, ethers.ZeroHash), "ZeroValue");
    });

    it("only anchorers can anchor heads", async () => {
      const { contract, stranger } = await deploy();
      await revertsWith(contract.connect(stranger).anchorAuditHead(1, HEAD(1)), "NotAnchorer");
    });
  });

  describe("ownership", () => {
    it("transfers in two steps", async () => {
      const { contract, owner, nextOwner } = await deploy();
      await contract.proposeOwner(nextOwner.address);
      assert.equal(await contract.owner(), owner.address);
      assert.equal(await contract.pendingOwner(), nextOwner.address);
      await contract.connect(nextOwner).acceptOwnership();
      assert.equal(await contract.owner(), nextOwner.address);
      assert.equal(await contract.pendingOwner(), ethers.ZeroAddress);
      // The old owner has lost its powers.
      await revertsWith(contract.addAnchorer(nextOwner.address), "NotOwner");
      await revertsWith(contract.proposeOwner(owner.address), "NotOwner");
    });

    it("a non-proposed account can't accept, and a cancelled proposal can't be accepted", async () => {
      const { contract, stranger, nextOwner } = await deploy();
      await revertsWith(contract.connect(stranger).acceptOwnership(), "NotPendingOwner");
      await contract.proposeOwner(nextOwner.address);
      await revertsWith(contract.connect(stranger).acceptOwnership(), "NotPendingOwner");
      await contract.proposeOwner(ethers.ZeroAddress);
      await revertsWith(contract.connect(nextOwner).acceptOwnership(), "NotPendingOwner");
    });

    it("only the owner can propose", async () => {
      const { contract, stranger } = await deploy();
      await revertsWith(contract.connect(stranger).proposeOwner(stranger.address), "NotOwner");
    });
  });

  describe("anchorer allow-list", () => {
    it("owner adds and removes anchorers; a removed anchorer can't anchor", async () => {
      const { contract, anchorer2 } = await deploy();
      assert.equal(await contract.isAnchorer(anchorer2.address), false);
      await contract.addAnchorer(anchorer2.address);
      assert.equal(await contract.isAnchorer(anchorer2.address), true);
      await contract.connect(anchorer2).anchor(id("a"), C1, 0, ethers.ZeroHash);
      await contract.removeAnchorer(anchorer2.address);
      assert.equal(await contract.isAnchorer(anchorer2.address), false);
      await revertsWith(contract.connect(anchorer2).anchor(id("b"), C1, 0, ethers.ZeroHash), "NotAnchorer");
    });

    it("a retired (removed) anchorer's past anchors stay trusted", async () => {
      const { contract, anchorer2 } = await deploy();
      await contract.addAnchorer(anchorer2.address);
      await contract.connect(anchorer2).anchor(id("a"), C1, 0, ethers.ZeroHash);
      await contract.removeAnchorer(anchorer2.address);
      assert.equal(await contract.isTrusted(id("a")), true);
      assert.equal(await contract.verify(id("a"), C1), true);
    });

    it("rejects zero, duplicate and unknown accounts; non-owners can't manage the list", async () => {
      const { contract, owner, anchorer2, stranger } = await deploy();
      await revertsWith(contract.addAnchorer(ethers.ZeroAddress), "ZeroAddress");
      await revertsWith(contract.addAnchorer(owner.address), "AlreadyAnchorer");
      await revertsWith(contract.removeAnchorer(anchorer2.address), "UnknownAnchorer");
      await revertsWith(contract.connect(stranger).addAnchorer(stranger.address), "NotOwner");
      await revertsWith(contract.connect(stranger).removeAnchorer(owner.address), "NotOwner");
      await revertsWith(contract.connect(stranger).revokeAnchorer(owner.address, 1), "NotOwner");
    });

    it("revoking distrusts anchors from the compromise time on, keeps earlier ones, and blocks re-adding", async () => {
      const { contract, anchorer2 } = await deploy();
      await contract.addAnchorer(anchorer2.address);
      await contract.connect(anchorer2).anchor(id("before"), C1, 0, ethers.ZeroHash);
      await network.provider.send("evm_increaseTime", [3600]);
      await network.provider.send("evm_mine", []);
      const compromisedAt = (await now()) + 1;
      await network.provider.send("evm_setNextBlockTimestamp", [compromisedAt]);
      await contract.connect(anchorer2).anchor(id("after"), C2, 0, ethers.ZeroHash);

      await contract.revokeAnchorer(anchorer2.address, compromisedAt);
      assert.equal(await contract.isAnchorer(anchorer2.address), false);
      assert.equal(await contract.distrustedFrom(anchorer2.address), BigInt(compromisedAt));
      assert.equal(await contract.verify(id("before"), C1), true);
      assert.equal(await contract.isTrusted(id("after")), false);
      assert.equal(await contract.verify(id("after"), C2), false);
      // The anchor itself stays on record (write-once), just untrusted.
      assert.equal((await contract.getAnchor(id("after")))[0], C2);

      await revertsWith(contract.addAnchorer(anchorer2.address), "RevokedAccount");
      // A later call can move the time earlier, never later.
      await contract.revokeAnchorer(anchorer2.address, compromisedAt + 1);
      assert.equal(await contract.distrustedFrom(anchorer2.address), BigInt(compromisedAt));
      await contract.revokeAnchorer(anchorer2.address, 1);
      assert.equal(await contract.distrustedFrom(anchorer2.address), 1n);
      assert.equal(await contract.verify(id("before"), C1), false);
    });

    it("refuses a zero, future or zero-address revocation", async () => {
      const { contract, anchorer2 } = await deploy();
      await revertsWith(contract.revokeAnchorer(anchorer2.address, 0), "InvalidRevocationTime");
      await revertsWith(contract.revokeAnchorer(anchorer2.address, (await now()) + 1000), "InvalidRevocationTime");
      await revertsWith(contract.revokeAnchorer(ethers.ZeroAddress, 1), "ZeroAddress");
    });

    it("the deployer-chosen first anchorer is listed and the zero address is refused", async () => {
      const { contract, owner } = await deploy();
      assert.equal(await contract.isAnchorer(owner.address), true);
      const Factory = await ethers.getContractFactory("EvidenceAnchorV2");
      await revertsWith(Factory.deploy(ethers.ZeroAddress), "ZeroAddress");
    });
  });
});
