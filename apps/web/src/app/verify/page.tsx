"use client";

import "@/lib/client/buffer-polyfill";

import { useState } from "react";
import { JsonRpcProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { hashTiles, buildMerkleTree, type TileHash } from "@digivault/crypto-core";

/**
 * Court Verification Portal. CLAUDE.md rule 5 / step 6 Part 3 requirements:
 *   - No auth. There is no middleware.ts anywhere in this app (confirmed),
 *     and this page calls useAuth/RequireAuth nowhere in its tree.
 *   - No calls to DigiVault's own backend for the verification logic. This
 *     file makes exactly one kind of network call: a public JSON-RPC read
 *     against Polygon Amoy, via ethers, for the document_version_id in the
 *     proof file. No fetch() to this app's own /api/* anywhere below.
 *   - The contract, chain and anchoring account are hardcoded below, never
 *     read from the proof file (F-02): a forger who controls the proof file
 *     could otherwise point it at their own contract holding any root.
 *   - MinIO is deliberately never checked here — it's the insider-threat
 *     anchor, not something an external verifier should need to trust.
 *   - Three outcomes: VERIFIED; UNTRUSTED (the proof or RPC points at a
 *     chain/contract/anchorer other than DigiVault's official ones); or
 *     MISMATCH for anything else that prevents a definitive VERIFIED (bad
 *     file, unreachable RPC, no anchor, a real hash mismatch). Fail-closed.
 */

// Official EvidenceAnchor deployment (packages/contracts/deployments/amoy.json).
// If the contract is ever redeployed, update these three together.
const TRUSTED_CONTRACT = "0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b";
const TRUSTED_CHAIN_ID = 80002;
const TRUSTED_ANCHORER = "0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873";

const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";
const ANCHOR_ABI = [
  "function getAnchor(bytes32 documentVersionId) external view returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)",
];

interface ProofFile {
  digivault_proof_version: number;
  document_version_id: string;
  grid_size: number;
  page_count: number;
  merkle_root: string;
  pages: { page_index: number; width_px: number; height_px: number; png_sha256: string }[];
  tiles: { tile_index: number; hash: string }[];
  anchor: {
    polygon_chain_id: number;
    contract_address: string;
    polygon_tx_hash: string;
    anchored_at: string;
  };
}

type Result =
  | { outcome: "idle" }
  | { outcome: "checking" }
  | { outcome: "verified"; proof: ProofFile }
  | { outcome: "untrusted"; reason: string; detail?: string }
  | { outcome: "mismatch"; reason: string; detail?: string };

function shortHash(value: string): string {
  if (value.length <= 28) return value;
  return `${value.slice(0, 16)}...${value.slice(-8)}`;
}

function FileDropZone({
  label,
  detail,
  accept,
  multiple,
  filenames,
  onChange,
}: {
  label: string;
  detail: string;
  accept: string;
  multiple?: boolean;
  filenames: string[];
  onChange: (files: FileList | null) => void;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: 10,
        minHeight: 154,
        padding: 18,
        border: "1px dashed #1f2937",
        borderRadius: 8,
        background: "#111827",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#60a5fa" strokeWidth="1.8" />
          <path d="M14 2v6h6" stroke="#60a5fa" strokeWidth="1.8" />
          <path d="M8 15h8M8 18h5" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>
          <strong style={{ display: "block", color: "#f9fafb", fontSize: 14 }}>{label}</strong>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>{detail}</span>
        </span>
      </span>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => onChange(e.target.files)} style={{ display: "none" }} />
      <span style={{ alignSelf: "end", color: filenames.length ? "#60a5fa" : "#9ca3af", fontSize: 12, fontFamily: filenames.length ? "monospace" : undefined }}>
        {filenames.length ? filenames.join(", ") : "Select file"}
      </span>
    </label>
  );
}

export default function VerifyPage() {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [pngFiles, setPngFiles] = useState<File[]>([]);
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<Result>({ outcome: "idle" });

  async function handleVerify() {
    setResult({ outcome: "checking" });
    try {
      if (!proofFile) throw new Error("No proof JSON file provided.");
      if (pngFiles.length === 0) throw new Error("No page PNG file(s) provided.");

      const proof = JSON.parse(await proofFile.text()) as ProofFile;
      if (!proof.merkle_root || !proof.document_version_id) {
        throw new Error("Proof file is missing required fields.");
      }

      // 0. The proof's own contract/chain fields are never used for the
      // lookup, but a proof that names anything else is rejected outright
      // rather than silently checked against the official contract.
      if (Number(proof.anchor?.polygon_chain_id) !== TRUSTED_CHAIN_ID) {
        setResult({
          outcome: "untrusted",
          reason: "Invalid — proof references an untrusted chain.",
          detail: `proof chain_id=${proof.anchor?.polygon_chain_id} expected=${TRUSTED_CHAIN_ID}`,
        });
        return;
      }
      if (String(proof.anchor?.contract_address ?? "").toLowerCase() !== TRUSTED_CONTRACT.toLowerCase()) {
        setResult({
          outcome: "untrusted",
          reason: "Invalid — proof references an untrusted contract.",
          detail: `proof contract=${proof.anchor?.contract_address} official=${TRUSTED_CONTRACT}`,
        });
        return;
      }

      // 1. Recompute the Merkle root from the PNG(s) actually supplied —
      // identical algorithm to packages/crypto-core (see docs/03), no
      // dependency on anything the backend claims about them.
      const sortedPngs = [...pngFiles].sort((a, b) => a.name.localeCompare(b.name));
      const allTiles: TileHash[] = [];
      for (let pageIndex = 0; pageIndex < sortedPngs.length; pageIndex++) {
        const bytes = await sortedPngs[pageIndex].arrayBuffer();
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        const tiles = await hashTiles(canvas, pageIndex, proof.grid_size, pageIndex * proof.grid_size ** 2);
        allTiles.push(...tiles);
      }
      const { rootHex: recomputedRoot } = buildMerkleTree(allTiles);

      const localMatch = recomputedRoot === proof.merkle_root;

      // 2. Check the recomputed root against the public Polygon Amoy
      // record directly — the only source of truth that matters here.
      // The RPC endpoint is user-editable (advanced options), so confirm it
      // actually serves Polygon Amoy before trusting anything it returns.
      const provider = new JsonRpcProvider(rpcUrl);
      const { chainId } = await provider.getNetwork();
      if (Number(chainId) !== TRUSTED_CHAIN_ID) {
        setResult({
          outcome: "untrusted",
          reason: "Invalid — the RPC endpoint is not Polygon Amoy.",
          detail: `rpc chain_id=${chainId} expected=${TRUSTED_CHAIN_ID}`,
        });
        return;
      }
      const contract = new Contract(TRUSTED_CONTRACT, ANCHOR_ABI, provider);
      const documentVersionIdBytes32 = keccak256(toUtf8Bytes(proof.document_version_id));
      const [onChainRootRaw, , anchoredBy] = await contract.getAnchor(documentVersionIdBytes32);
      const onChainRoot = (onChainRootRaw as string).replace(/^0x/, "").toLowerCase();

      if (onChainRoot === "0".repeat(64)) {
        setResult({ outcome: "mismatch", reason: "No anchor found on-chain for this document version." });
        return;
      }

      if ((anchoredBy as string).toLowerCase() !== TRUSTED_ANCHORER.toLowerCase()) {
        setResult({
          outcome: "untrusted",
          reason: "Invalid — anchor was not written by the official DigiVault account.",
          detail: `anchoredBy=${anchoredBy} official=${TRUSTED_ANCHORER}`,
        });
        return;
      }

      const onChainMatch = onChainRoot === proof.merkle_root.toLowerCase();

      if (localMatch && onChainMatch) {
        setResult({ outcome: "verified", proof });
      } else if (!localMatch) {
        setResult({
          outcome: "mismatch",
          reason: "The supplied page image(s) do not hash to the root stated in the proof file.",
          detail: `recomputed=${recomputedRoot} proof=${proof.merkle_root}`,
        });
      } else {
        setResult({
          outcome: "mismatch",
          reason: "The proof file's root does not match the public Polygon Amoy record.",
          detail: `proof=${proof.merkle_root} on_chain=${onChainRoot}`,
        });
      }
    } catch (err) {
      setResult({
        outcome: "mismatch",
        reason: "Verification could not be completed.",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const canVerify = Boolean(proofFile && pngFiles.length > 0 && result.outcome !== "checking");

  return (
    <main style={{ minHeight: "100vh", background: "#0a0f1a", color: "#f9fafb", padding: "40px 24px" }}>
      <style>{`
        @keyframes resultFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .result-card { animation: resultFade 180ms ease-out; }
      `}</style>
      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: "0 0 8px", color: "#60a5fa", fontSize: 12, fontWeight: 800 }}>PUBLIC COURT VERIFICATION</p>
          <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2 }}>Court Document Verification</h1>
          <p style={{ margin: "10px 0 0", color: "#9ca3af", fontSize: 14, lineHeight: 1.6 }}>
            Independent verification - no account required, no connection to DigiVault servers.
          </p>
        </header>

        <div style={{ display: "grid", gap: 14 }}>
          <FileDropZone
            label="Redacted PNG page(s)"
            detail="Upload every page image from the verification bundle."
            accept="image/png"
            multiple
            filenames={pngFiles.map((f) => f.name)}
            onChange={(files) => setPngFiles(Array.from(files ?? []))}
          />
          <FileDropZone
            label="Proof JSON"
            detail="Use the verification-proof.json file from the bundle."
            accept="application/json"
            filenames={proofFile ? [proofFile.name] : []}
            onChange={(files) => setProofFile(files?.[0] ?? null)}
          />

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ justifySelf: "start", fontSize: 12, background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 0 }}
          >
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>
          {showAdvanced && (
            <label style={{ fontSize: 13, color: "#9ca3af" }}>
              Polygon RPC endpoint
              <input
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, fontFamily: "monospace", fontSize: 12, color: "#f9fafb", background: "#111827", border: "1px solid #1f2937", borderRadius: 6, padding: 10 }}
              />
            </label>
          )}

          <button
            onClick={handleVerify}
            disabled={!canVerify}
            style={{
              marginTop: 4,
              padding: "12px 14px",
              fontSize: 14,
              fontWeight: 800,
              color: canVerify ? "#f9fafb" : "#9ca3af",
              background: canVerify ? "#3b82f6" : "#1f2937",
              border: `1px solid ${canVerify ? "#3b82f6" : "#1f2937"}`,
              borderRadius: 6,
              cursor: canVerify ? "pointer" : "not-allowed",
            }}
          >
            Verify
          </button>
        </div>

        {result.outcome === "checking" && (
          <div className="result-card" style={{ marginTop: 24, padding: 18, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", border: "3px solid #1f2937", borderTopColor: "#3b82f6", animation: "spin 900ms linear infinite" }} />
            <strong>Checking blockchain record...</strong>
          </div>
        )}

        {result.outcome === "verified" && (
          <div className="result-card" style={{ marginTop: 24, padding: 20, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.65)", boxShadow: "0 0 0 1px rgba(16,185,129,0.12), 0 18px 60px rgba(16,185,129,0.08)", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="1.8" />
                <path d="m7 12 3 3 7-7" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h2 style={{ margin: 0, color: "#d1fae5", fontSize: 20 }}>Verified - matches public blockchain record</h2>
                <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: 13 }}>The supplied document pages match the public Polygon Amoy anchor.</p>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: 8, fontSize: 13 }}>
              <div>merkle_root: <code title={result.proof.merkle_root} style={{ color: "#60a5fa", fontFamily: "monospace" }}>{shortHash(result.proof.merkle_root)}</code></div>
              <div>
                polygon_tx_hash:{" "}
                <a href={`https://amoy.polygonscan.com/tx/${result.proof.anchor.polygon_tx_hash}`} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontFamily: "monospace" }}>
                  {shortHash(result.proof.anchor.polygon_tx_hash)}
                </a>
              </div>
              <div>anchored_at: <code style={{ color: "#60a5fa", fontFamily: "monospace" }}>{result.proof.anchor.anchored_at}</code></div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                border: "1px solid rgba(16,185,129,0.5)",
                borderRadius: 999,
                background: "rgba(16,185,129,0.12)",
                color: "#6ee7b7",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span aria-hidden>🛡</span>
              Verified against official DigiVault contract
              <a
                href={`https://amoy.polygonscan.com/address/${TRUSTED_CONTRACT}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa", fontFamily: "monospace", fontWeight: 400 }}
              >
                {shortHash(TRUSTED_CONTRACT)}
              </a>
            </div>
          </div>
        )}

        {result.outcome === "untrusted" && (
          <div className="result-card" style={{ marginTop: 24, padding: 20, background: "rgba(239,68,68,0.14)", border: "2px solid #ef4444", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2 2 20h20L12 2z" stroke="#ef4444" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M12 9v5" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="17" r="1.2" fill="#ef4444" />
              </svg>
              <div>
                <h2 style={{ margin: 0, color: "#fecaca", fontSize: 20 }}>{result.reason}</h2>
                <p style={{ margin: "4px 0 0", color: "#fca5a5", fontSize: 13 }}>
                  This proof was not checked against the official DigiVault record. Treat the document as unverified.
                </p>
              </div>
            </div>
            {result.detail && <p style={{ margin: "14px 0 0", fontFamily: "monospace", fontSize: 11, color: "#9ca3af", overflowWrap: "anywhere" }}>{result.detail}</p>}
          </div>
        )}

        {result.outcome === "mismatch" && (
          <div className="result-card" style={{ marginTop: 24, padding: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.72)", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8" />
                <path d="m8 8 8 8M16 8l-8 8" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <div>
                <h2 style={{ margin: 0, color: "#fecaca", fontSize: 20 }}>Mismatch - do not trust this document</h2>
                <p style={{ margin: "4px 0 0", color: "#fca5a5", fontSize: 13 }}>{result.reason}</p>
              </div>
            </div>
            {result.detail && <p style={{ margin: "14px 0 0", fontFamily: "monospace", fontSize: 11, color: "#9ca3af", overflowWrap: "anywhere" }}>{result.detail}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
