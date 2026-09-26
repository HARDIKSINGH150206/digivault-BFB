import { MerkleTree } from "merkletreejs";
import { sha256 as syncSha256 } from "js-sha256";
import { Buffer } from "buffer";
import type { TileHash } from "./types";

/**
 * merkletreejs needs a SYNCHRONOUS hash function to combine sibling nodes
 * while building the tree, but WebCrypto's crypto.subtle.digest is async
 * (no sync WebCrypto exists in a browser). Leaf hashes (tile pixel hashes,
 * see tiles.ts) are still computed with real WebCrypto SHA-256, in
 * parallel, ahead of time. Only the *internal* node combination step below
 * uses js-sha256, a synchronous pure-JS SHA-256 implementation — same
 * algorithm, different implementation, cryptographically equivalent output.
 * Documented here because it matters for anyone reimplementing verification
 * independently: every hash in this tree is plain SHA-256, regardless of
 * which of the two implementations computed it.
 */
function hashFn(data: Buffer): Buffer {
  return Buffer.from(syncSha256.arrayBuffer(data));
}

export interface BuiltTree {
  tree: MerkleTree;
  rootHex: string;
  leavesHex: string[];
}

/** Builds one Merkle tree over ALL tiles in a document version, in global tile order. */
export function buildMerkleTree(tiles: TileHash[]): BuiltTree {
  const sorted = [...tiles].sort((a, b) => a.index - b.index);
  const leaves = sorted.map((t) => Buffer.from(t.hashHex, "hex"));
  const tree = new MerkleTree(leaves, hashFn, { sortPairs: false });
  return {
    tree,
    rootHex: tree.getRoot().toString("hex"),
    leavesHex: leaves.map((l) => l.toString("hex")),
  };
}

export function getProofForLeaf(tree: MerkleTree, leafHex: string) {
  const leaf = Buffer.from(leafHex, "hex");
  return tree.getProof(leaf);
}

export function verifyProof(
  tree: MerkleTree,
  proof: ReturnType<MerkleTree["getProof"]>,
  leafHex: string,
  rootHex: string
): boolean {
  const leaf = Buffer.from(leafHex, "hex");
  const root = Buffer.from(rootHex, "hex");
  return tree.verify(proof, leaf, root);
}
