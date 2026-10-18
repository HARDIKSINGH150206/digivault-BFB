import { sha256 as syncSha256 } from "js-sha256";

/**
 * RFC 6962 Merkle Tree Hash (docs/03 §v2, docs/07 Phase 1). Replaces
 * merkletreejs for v2 so the browser, Node and any third-party verifier
 * implement one short, published spec:
 *
 *   MTH({d0})      = leaf hash (computed by the caller, prefix 0x00)
 *   MTH(D[n]), n>1 = H(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n])),
 *                    k = the largest power of two < n
 *
 * Splitting at a power of two means an odd node is never duplicated (no
 * CVE-2012-2459-style second tree with the same root), and the 0x00/0x01
 * prefixes mean a leaf can never be passed off as an inner node.
 *
 * Inner nodes use js-sha256 (synchronous) so trees and paths can be built
 * without awaiting every node; leaves are hashed with WebCrypto by the
 * caller. Both are plain SHA-256.
 */

export const NODE_PREFIX = 0x01;

export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const input = new Uint8Array(1 + left.byteLength + right.byteLength);
  input[0] = NODE_PREFIX;
  input.set(left, 1);
  input.set(right, 1 + left.byteLength);
  return new Uint8Array(syncSha256.arrayBuffer(input));
}

/** Largest power of two strictly less than n (n >= 2). */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** MTH over leaf hashes, in order. Throws on an empty list: no DigiVault tree is ever empty. */
export function merkleTreeHash(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) throw new Error("merkleTreeHash: no leaves.");
  return mth(leaves, 0, leaves.length);
}

function mth(leaves: Uint8Array[], start: number, end: number): Uint8Array {
  const n = end - start;
  if (n === 1) return leaves[start];
  const k = splitPoint(n);
  return nodeHash(mth(leaves, start, start + k), mth(leaves, start + k, end));
}

/** RFC 6962 §2.1.1 audit path for leaf `index`, ordered from the leaf upwards. */
export function inclusionPath(leaves: Uint8Array[], index: number): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error(`inclusionPath: index ${index} out of range for ${leaves.length} leaves.`);
  }
  const path: Uint8Array[] = [];
  let start = 0;
  let end = leaves.length;
  let m = index;
  // Walk down from the root, collecting the sibling subtree at each split;
  // RFC 6962 lists the path bottom-up, so reverse at the end.
  while (end - start > 1) {
    const k = splitPoint(end - start);
    if (m < k) {
      path.push(mth(leaves, start + k, end));
      end = start + k;
    } else {
      path.push(mth(leaves, start, start + k));
      start = start + k;
      m -= k;
    }
  }
  return path.reverse();
}

/**
 * RFC 9162 §2.1.3.2: the root implied by (leafHash, index, treeSize, path),
 * or null if the path has the wrong shape for that index and size (too short,
 * too long, or index >= treeSize).
 */
export function rootFromInclusionPath(
  leafHash: Uint8Array,
  index: number,
  treeSize: number,
  path: Uint8Array[]
): Uint8Array | null {
  if (!Number.isInteger(index) || !Number.isInteger(treeSize) || index < 0 || index >= treeSize) return null;
  let fn = index;
  let sn = treeSize - 1;
  let r = leafHash;
  for (const p of path) {
    if (sn === 0) return null;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 ? r : null;
}

export function verifyInclusion(
  leafHash: Uint8Array,
  index: number,
  treeSize: number,
  path: Uint8Array[],
  root: Uint8Array
): boolean {
  const computed = rootFromInclusionPath(leafHash, index, treeSize, path);
  return computed !== null && bytesEqual(computed, root);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
