/**
 * Public, redaction-safe proof files and certificate verification links
 * (ADR-022, docs/07 P0.6 / Phase 5).
 *
 * The public proof uses the field names of verification-proof.json v2
 * (docs/04 section 5) but is a strict subset of it: it backs the chain-only
 * certificate check, and verifying page images needs the full proof, whose
 * salts are not public. It carries only opaque identifiers and hashes:
 *   - no case number, FIR number, document title, names or officer data;
 *   - no per-tile hashes and no page-image hashes (the verifier recomputes
 *     everything from the pages it is given);
 *   - no salts at all — redaction proofs reveal unmasked salts separately
 *     (lib/tile-salts.ts: revealableSalts), never masked ones.
 * It is only published for salted (v2+) versions; v1 is legacy (ADR-021).
 */

export interface PublicProofInput {
  proofVersion: number;
  documentVersionId: string;
  commitment: string;
  gridSize: number;
  pageCount: number;
  isRedacted: boolean;
  anchor: { chainId: number; contractAddress: string; txHash: string; anchoredAt: Date };
}

export const PUBLIC_PROOF_KEYS = [
  "digivault_proof_version",
  "public",
  "document_version_id",
  "commitment",
  "grid_size",
  "page_count",
  "is_redacted",
  "anchor",
  "verify_url",
] as const;

const HEX64 = /^[0-9a-f]{64}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;

export function publicVerifyUrl(
  params: { documentVersionId: string; commitment: string; txHash: string },
  base: string | undefined = process.env.PUBLIC_BASE_URL
): string {
  const url = new URL("verify", (base || "http://localhost:3000").replace(/\/+$/, "") + "/");
  url.searchParams.set("v", params.documentVersionId);
  url.searchParams.set("c", params.commitment.toLowerCase().replace(/^0x/, ""));
  url.searchParams.set("tx", params.txHash.toLowerCase());
  return url.toString();
}

export function buildPublicProof(input: PublicProofInput, base?: string): Record<(typeof PUBLIC_PROOF_KEYS)[number], unknown> {
  const commitment = input.commitment.toLowerCase().replace(/^0x/, "");
  const txHash = input.anchor.txHash.toLowerCase();
  if (!HEX64.test(commitment)) throw new Error("commitment must be 32 bytes of hex.");
  if (!TX_HASH.test(txHash)) throw new Error("txHash must be a 0x-prefixed 32-byte hash.");
  return {
    digivault_proof_version: input.proofVersion,
    public: true,
    document_version_id: input.documentVersionId,
    commitment,
    grid_size: input.gridSize,
    page_count: input.pageCount,
    is_redacted: input.isRedacted,
    anchor: {
      polygon_chain_id: input.anchor.chainId,
      contract_address: input.anchor.contractAddress,
      polygon_tx_hash: txHash,
      anchored_at: input.anchor.anchoredAt.toISOString(),
    },
    verify_url: publicVerifyUrl({ documentVersionId: input.documentVersionId, commitment, txHash }, base),
  };
}
