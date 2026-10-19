/**
 * Proof format v2 helpers (docs/03 §v2, docs/04 §5, ADR-018/021).
 */

export const PROOF_V2 = 2;

interface VersionHashes {
  proofVersion: number;
  merkleRoot: string;
  commitment: string | null;
}

/**
 * The value anchored on-chain and in MinIO for a version: the commitment C
 * for v2, the merkle root for legacy v1. Everything that writes or compares
 * an anchor goes through this.
 */
export function anchoredValue(v: VersionHashes): string {
  if (v.proofVersion === 1) return v.merkleRoot;
  if (!v.commitment) throw new Error("v2 version has no commitment.");
  return v.commitment;
}

const SALT_HEX = /^[0-9a-f]{64}$/;

/**
 * Parses the client's salts for an upload: exactly `count` 32-byte hex
 * values, all distinct. Distinctness is a cheap guard against a client that
 * sends constant or zero salts, which would make leaves guessable for
 * low-entropy tiles (blank margins) once the version is shared.
 */
export function parseUploadSalts(raw: unknown, count: number): { salts: Buffer[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length !== count) return { error: `salts must be an array of ${count} hex strings.` };
  if (!raw.every((s) => typeof s === "string" && SALT_HEX.test(s))) return { error: "Every salt must be 64 lowercase hex characters." };
  if (new Set(raw).size !== raw.length) return { error: "Salts must all be distinct." };
  return { salts: raw.map((s: string) => Buffer.from(s, "hex")) };
}

export interface VerificationProofV2Input {
  documentVersionId: string;
  isRedacted: boolean;
  gridSize: number;
  fileHash: string;
  documentRoot: string;
  commitment: string;
  pages: { pageIndex: number; widthPx: number; heightPx: number; pngSha256: string; pageRoot: string }[];
  tiles: { tileIndex: number; leaf: string }[];
  /** From lib/tile-salts.ts revealableSalts() — the only selector for salts that leave the server. */
  salts: { k: number; salt: string }[];
  anchor: { chainId: number; contractAddress: string; txHash: string; anchoredAt: Date };
}

/**
 * verification-proof.json, v2. Everything the public portal needs to
 * recompute C from the page PNGs: the salts of this version's tiles, plus
 * each leaf and page root so a mismatch can be pinned to a tile. The
 * portal recomputes all of it and trusts none of it — only the on-chain
 * value decides (CLAUDE.md rule 5).
 */
export function buildVerificationProofV2(input: VerificationProofV2Input) {
  const saltByTile = new Map(input.salts.map((s) => [s.k, s.salt]));
  if (saltByTile.size !== input.tiles.length) throw new Error("Proof needs one salt per tile.");
  return {
    digivault_proof_version: PROOF_V2,
    document_version_id: input.documentVersionId,
    is_redacted: input.isRedacted,
    grid_size: input.gridSize,
    page_count: input.pages.length,
    file_hash: input.fileHash,
    document_root: input.documentRoot,
    commitment: input.commitment,
    pages: input.pages.map((p) => ({
      page_index: p.pageIndex,
      width_px: p.widthPx,
      height_px: p.heightPx,
      png_sha256: p.pngSha256,
      page_root: p.pageRoot,
    })),
    tiles: input.tiles.map((t) => {
      const salt = saltByTile.get(t.tileIndex);
      if (!salt) throw new Error(`No salt for tile ${t.tileIndex}.`);
      return { tile_index: t.tileIndex, leaf: t.leaf, salt };
    }),
    anchor: {
      polygon_chain_id: input.anchor.chainId,
      contract_address: input.anchor.contractAddress,
      polygon_tx_hash: input.anchor.txHash,
      anchored_at: input.anchor.anchoredAt.toISOString(),
    },
  };
}
