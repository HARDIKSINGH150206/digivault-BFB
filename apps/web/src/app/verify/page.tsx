"use client";

import "@/lib/client/buffer-polyfill";

import { useState } from "react";
import { JsonRpcProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { hashTiles, buildMerkleTree, type TileHash } from "@digivault/crypto-core";
import { manrope, inter } from "@/lib/client/fonts";
import { BrandMark } from "../dashboard/_workspace/shell";

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

const VERIFY_CSS = `
.vf { min-height: 100vh; background: #F6F8FA; color: #1D2226; }
.vf *, .vf *::before, .vf *::after { box-sizing: border-box; }
.vf-header { height: 72px; display: flex; align-items: center; gap: 12px; padding: 0 28px; background: #FFFFFF; border-bottom: 1px solid #E3E8ED; }
.vf-brand-name { font-family: var(--font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.4px; line-height: 1.1; }
.vf-brand-sub { font-size: 12.5px; color: #5E5E5E; margin-top: 1px; }
.vf-main { max-width: 680px; margin: 0 auto; padding: 40px 20px 56px; }
.vf-eyebrow { margin: 0 0 10px; font-size: 12.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #5E5E5E; }
.vf-title { margin: 0; font-family: var(--font-display); font-size: 32px; font-weight: 800; letter-spacing: -0.7px; line-height: 1.15; }
.vf-lede { margin: 10px 0 0; font-size: 16px; line-height: 1.55; color: #5E5E5E; }
.vf-card { margin-top: 26px; padding: 24px; background: #FFFFFF; border: 1px solid #E3E8ED; border-radius: 14px; box-shadow: 0 1px 2px rgba(29,34,38,0.04); display: grid; gap: 14px; }
.vf-drop { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1.5px dashed #C3CDD7; border-radius: 12px; background: #FBFCFD; cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease; }
.vf-drop:hover { border-color: #0A66C2; background: #F4F8FC; }
.vf-drop:focus-within { outline: 2px solid #0A66C2; outline-offset: 2px; }
.vf-drop-icon { width: 44px; height: 44px; border-radius: 10px; background: #EAF2FB; color: #0A66C2; display: grid; place-items: center; flex: none; }
.vf-drop-label { display: block; font-size: 15px; font-weight: 600; color: #1D2226; }
.vf-drop-detail { display: block; margin-top: 2px; font-size: 13.5px; color: #5E5E5E; }
.vf-drop-files { display: block; margin-top: 6px; font-size: 12.5px; color: #0A66C2; overflow-wrap: anywhere; }
.vf-drop-empty { display: block; margin-top: 6px; font-size: 12.5px; color: #8A939B; }
.vf-advanced { justify-self: start; background: none; border: 0; padding: 0; font: inherit; font-size: 13.5px; font-weight: 600; color: #0A66C2; cursor: pointer; }
.vf-advanced:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; border-radius: 2px; }
.vf-input { display: block; width: 100%; margin-top: 6px; height: 42px; padding: 0 12px; border: 1px solid #D0D7DE; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #1D2226; background: #FFFFFF; }
.vf-input:focus-visible { outline: none; border-color: #0A66C2; box-shadow: 0 0 0 3px rgba(10,102,194,0.2); }
.vf-primary { height: 48px; border: 0; border-radius: 10px; background: #0A66C2; color: #FFFFFF; font: inherit; font-size: 15.5px; font-weight: 600; cursor: pointer; transition: background-color 120ms ease; }
.vf-primary:hover:not(:disabled) { background: #004182; }
.vf-primary:focus-visible { outline: none; box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px #0A66C2; }
.vf-primary:disabled { background: #E3E8ED; color: #6B737A; cursor: not-allowed; }
.vf-result { margin-top: 20px; padding: 20px; border-radius: 14px; border: 1px solid; animation: vf-in 180ms ease-out; }
.vf-result-row { display: flex; gap: 14px; align-items: center; }
.vf-result h2 { margin: 0; font-size: 19px; font-weight: 700; }
.vf-result p { margin: 4px 0 0; font-size: 14px; }
.vf-ok { background: #EAF6EF; border-color: #B7DEC7; }
.vf-ok h2 { color: #05542F; }
.vf-bad { background: #FDF1F1; border-color: #F4C7C8; }
.vf-bad h2 { color: #A30D12; }
.vf-checking { background: #FFFFFF; border-color: #E3E8ED; }
.vf-untrusted { border-width: 2px; border-color: #CC1016; }
.vf-official { margin-top: 14px; display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; border: 1px solid #B7DEC7; background: #FFFFFF; color: #057642; font-size: 12.5px; font-weight: 600; }
.vf-facts { margin-top: 14px; display: grid; gap: 6px; font-size: 13.5px; color: #1D2226; }
.vf-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #0A66C2; }
.vf-detail { margin: 12px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: #5E5E5E; overflow-wrap: anywhere; }
.vf-spinner { width: 20px; height: 20px; border-radius: 50%; border: 3px solid #E3E8ED; border-top-color: #0A66C2; animation: vf-spin 900ms linear infinite; flex: none; }
@keyframes vf-spin { to { transform: rotate(360deg); } }
@keyframes vf-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .vf-result, .vf-spinner { animation: none; } }
@media (max-width: 560px) { .vf-header { padding: 0 16px; } .vf-title { font-size: 27px; } }
`;

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
    <label className="vf-drop">
      <span className="vf-drop-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5l-4-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3.5v4h4M9 12.5h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="vf-drop-label">{label}</span>
        <span className="vf-drop-detail">{detail}</span>
        {filenames.length ? <span className="vf-drop-files">{filenames.join(", ")}</span> : <span className="vf-drop-empty">No file selected</span>}
      </span>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => onChange(e.target.files)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
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
    <div className={`vf ${inter.variable} ${manrope.variable} ${inter.className}`}>
      <style>{VERIFY_CSS}</style>
      <header className="vf-header">
        <BrandMark />
        <div>
          <div className="vf-brand-name">DigiVault</div>
          <div className="vf-brand-sub">Public verification</div>
        </div>
      </header>

      <main className="vf-main">
        <p className="vf-eyebrow">Public court verification</p>
        <h1 className="vf-title">Court Document Verification</h1>
        <p className="vf-lede">Independent verification - no account required, no connection to DigiVault servers.</p>

        <div className="vf-card">
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

          <button type="button" className="vf-advanced" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>
          {showAdvanced && (
            <label style={{ fontSize: 13.5, fontWeight: 600, color: "#1D2226" }}>
              Polygon RPC endpoint
              <input className="vf-input" value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
            </label>
          )}

          <button type="button" className="vf-primary" onClick={handleVerify} disabled={!canVerify}>
            Verify
          </button>
        </div>

        {result.outcome === "checking" && (
          <div className="result-card vf-result vf-checking" role="status">
            <div className="vf-result-row">
              <span className="vf-spinner" aria-hidden="true" />
              <strong>Checking blockchain record...</strong>
            </div>
          </div>
        )}

        {result.outcome === "verified" && (
          <div className="result-card vf-result vf-ok" role="status">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#057642" />
                <path d="m7 12 3 3 7-7" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h2>Verified - matches public blockchain record</h2>
                <p style={{ color: "#1D2226" }}>The supplied document pages match the public Polygon Amoy anchor.</p>
              </div>
            </div>
            <div className="vf-facts">
              <div>merkle_root: <code title={result.proof.merkle_root} className="vf-code">{shortHash(result.proof.merkle_root)}</code></div>
              <div>
                polygon_tx_hash:{" "}
                <a href={`https://amoy.polygonscan.com/tx/${result.proof.anchor.polygon_tx_hash}`} target="_blank" rel="noreferrer" className="vf-code">
                  {shortHash(result.proof.anchor.polygon_tx_hash)}
                </a>
              </div>
              <div>anchored_at: <code className="vf-code">{result.proof.anchor.anchored_at}</code></div>
            </div>
            <div className="vf-official">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3.5 19 6.3v5.2c0 4.4-2.8 7.5-7 9-4.2-1.5-7-4.6-7-9V6.3l7-2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verified against official DigiVault contract
              <a href={`https://amoy.polygonscan.com/address/${TRUSTED_CONTRACT}`} target="_blank" rel="noreferrer" className="vf-code">
                {shortHash(TRUSTED_CONTRACT)}
              </a>
            </div>
          </div>
        )}

        {result.outcome === "untrusted" && (
          <div className="result-card vf-result vf-bad vf-untrusted" role="alert">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.5 1.8 20.5h20.4L12 2.5Z" fill="#CC1016" />
                <path d="M12 9.5v5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="17.3" r="1.2" fill="#FFFFFF" />
              </svg>
              <div>
                <h2>{result.reason}</h2>
                <p style={{ color: "#1D2226" }}>This proof was not checked against the official DigiVault record. Treat the document as unverified.</p>
              </div>
            </div>
            {result.detail && <p className="vf-detail">{result.detail}</p>}
          </div>
        )}

        {result.outcome === "mismatch" && (
          <div className="result-card vf-result vf-bad" role="alert">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#CC1016" />
                <path d="m8 8 8 8M16 8l-8 8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <div>
                <h2>Mismatch - do not trust this document</h2>
                <p style={{ color: "#1D2226" }}>{result.reason}</p>
              </div>
            </div>
            {result.detail && <p className="vf-detail">{result.detail}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
