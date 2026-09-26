import { sha256, toHex } from "@digivault/crypto-core";

/**
 * chain_hash = SHA256(previous_hash + merkle_root + version_no + timestamp)
 * per docs/04-api-spec.md endpoint 3. version_no is its ASCII decimal
 * string; timestamp is the new version's ISO-8601 UTC creation timestamp.
 * Including version_no and timestamp (not just previous_hash/merkle_root)
 * makes the chain resistant to reordering and gives external auditors a
 * cross-check point against the audit log and the anchor timestamp.
 */
export async function computeChainHash(params: {
  previousHash: string | null;
  merkleRoot: string;
  versionNo: number;
  timestamp: Date;
}): Promise<string> {
  const { previousHash, merkleRoot, versionNo, timestamp } = params;
  const input = `${previousHash ?? ""}${merkleRoot}${versionNo}${timestamp.toISOString()}`;
  const digest = await sha256(new TextEncoder().encode(input));
  return toHex(digest);
}
