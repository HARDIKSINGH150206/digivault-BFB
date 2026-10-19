"use client";

import "@/lib/client/buffer-polyfill";

import { useEffect, useState } from "react";
import Link from "next/link";
import { JsonRpcProvider, Network, Contract, Interface, keccak256, toUtf8Bytes } from "ethers";
import {
  hashTiles,
  buildMerkleTree,
  invalidRedactionProof,
  REDACTION_PROOF_FORMAT,
  tileRects,
  type RedactionCheck,
  type RedactionProof,
  type TileHash,
} from "@digivault/crypto-core";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark } from "../dashboard/_workspace/shell";
import { describeV2Mismatch, invalidProofV2, recomputeV2, type ProofFileV2 } from "./proof-v2";
import { describeRedactionProblem, recomputeRedaction } from "./redaction";
import { CERTIFICATE_QR_STATEMENT } from "@/lib/certificate-text";

/**
 * Court Verification Portal. CLAUDE.md rule 5 / step 6 Part 3 requirements:
 *   - No auth. There is no middleware.ts anywhere in this app (confirmed),
 *     and this page calls useAuth/RequireAuth nowhere in its tree.
 *   - No calls to DigiVault's own backend for the verification logic. This
 *     file makes exactly one kind of network call: a public JSON-RPC read
 *     against Polygon Amoy, via ethers, for the document_version_id in the
 *     proof file. No fetch() to this app's own /api/* anywhere below.
 *   - The contracts, chain and v1 anchoring account are hardcoded below,
 *     never read from the proof file (F-02): a forger who controls the proof
 *     file could otherwise point it at their own contract holding any root.
 *     Two official contracts (ADR-028): EvidenceAnchorV2 for every anchor
 *     since Phase 2 — trust comes from its own allow-list and isTrusted(),
 *     which excludes anchors by a revoked key — and the v1 EvidenceAnchor,
 *     read-only, for older anchors, trusted only if written by the v1 account.
 *   - MinIO is deliberately never checked here — it's the insider-threat
 *     anchor, not something an external verifier should need to trust.
 *   - Proof formats: `digivault_proof_version: 2` (salted tiles, RFC 6962,
 *     anchored commitment C — docs/03 §v2, ./proof-v2.ts) is current;
 *     `1` is verified on a read-only legacy path and labelled "Legacy v1
 *     proof (unsalted)" (ADR-021). Any other version is refused.
 *   - Certificate QR mode (ADR-022): /verify?v=<versionId>&c=<commitment>&tx=<txHash>
 *     checks the commitment and the tx against the chain only — no files,
 *     no MinIO, no backend — and says plainly that no document file was checked.
 *   - Redaction proofs (`format: "digivault-redaction-proof/1"`, docs/03
 *     §Redaction proofs, ./redaction.ts): the dropped redacted PNGs must
 *     rebuild the ORIGINAL version's anchored commitment (unmasked tiles
 *     recomputed with the original's revealed salts, masked tiles solid
 *     mask colour with their salted leaves taken as given) AND the
 *     redacted version's own anchored commitment. Both anchors are read
 *     from the official contracts, never from the proof's addresses.
 *   - Three outcomes: VERIFIED; UNTRUSTED (the proof or RPC points at a
 *     chain/contract/anchorer other than DigiVault's official ones); or
 *     MISMATCH for anything else that prevents a definitive VERIFIED (bad
 *     file, unreachable RPC, no anchor, a real hash mismatch). Fail-closed.
 */

// Official deployments: packages/contracts/deployments/amoy-v2.json (current)
// and amoy.json (legacy v1). If a contract is ever redeployed, update these
// together with that file.
const TRUSTED_CHAIN_ID = 80002;
const CONTRACT_V2 = "0x01e7e6f83f55873E906465d3447cB43434D4ee67";
const LEGACY_V1_CONTRACT = "0xFAf1031E2A4EF75Cf871bF93035DA062AB6D1A5b";
const LEGACY_V1_ANCHORER = "0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873";

const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";
// Tried in order when the RPC field is left at its default; a user-entered
// endpoint is used on its own.
const FALLBACK_RPC_URLS = ["https://rpc-amoy.polygon.technology"];
const V1_ABI = [
  "function getAnchor(bytes32 documentVersionId) external view returns (bytes32 merkleRoot, uint256 timestamp, address anchoredBy)",
  "event RootAnchored(bytes32 indexed documentVersionId, bytes32 merkleRoot, uint256 timestamp, address anchoredBy)",
];
const V2_ABI = [
  "function getAnchor(bytes32 docId) external view returns (bytes32 commitment, uint256 timestamp, address anchoredBy)",
  "function isTrusted(bytes32 docId) external view returns (bool)",
  "event DocumentAnchored(bytes32 indexed docId, bytes32 commitment, uint256 timestamp, address indexed anchoredBy)",
];

interface OfficialContract {
  address: string;
  label: string;
  abi: string[];
  /** Event that records an anchor, and the names of its (key, value) args. */
  event: { name: string; key: string; value: string };
}
const OFFICIAL_CONTRACTS: OfficialContract[] = [
  { address: CONTRACT_V2, label: "EvidenceAnchorV2", abi: V2_ABI, event: { name: "DocumentAnchored", key: "docId", value: "commitment" } },
  {
    address: LEGACY_V1_CONTRACT,
    label: "EvidenceAnchor v1 (legacy)",
    abi: V1_ABI,
    event: { name: "RootAnchored", key: "documentVersionId", value: "merkleRoot" },
  },
];

function officialContract(address: string | null | undefined): OfficialContract | undefined {
  return OFFICIAL_CONTRACTS.find((c) => c.address.toLowerCase() === String(address ?? "").toLowerCase());
}

type OnChainAnchor =
  | { found: false }
  | { found: true; value: string; timestamp: number; anchoredBy: string; trusted: true }
  | { found: true; value: string; timestamp: number; anchoredBy: string; trusted: false; reason: string };

/**
 * The anchor for versionId on one official contract. v2: trusted when the
 * contract's isTrusted() says so (allow-listed, not revoked as of the anchor
 * time). v1: trusted only when written by the v1 anchoring account.
 */
async function readOfficialAnchor(provider: JsonRpcProvider, official: OfficialContract, versionId: string): Promise<OnChainAnchor> {
  const key = keccak256(toUtf8Bytes(versionId));
  const contract = new Contract(official.address, official.abi, provider);
  const [raw, timestamp, anchoredBy] = await contract.getAnchor(key);
  const value = (raw as string).replace(/^0x/, "").toLowerCase();
  if (Number(timestamp) === 0) return { found: false };
  const base = { found: true as const, value, timestamp: Number(timestamp), anchoredBy: anchoredBy as string };
  if (official.address === CONTRACT_V2) {
    return (await contract.isTrusted(key))
      ? { ...base, trusted: true }
      : { ...base, trusted: false, reason: "Invalid — the account that wrote this anchor has been revoked by the contract owner." };
  }
  return (anchoredBy as string).toLowerCase() === LEGACY_V1_ANCHORER.toLowerCase()
    ? { ...base, trusted: true }
    : { ...base, trusted: false, reason: "Invalid — anchor was not written by the official DigiVault account." };
}
const SUPPORTED_PROOF_VERSIONS = [1, 2];
const LEGACY_V1_LABEL = "Legacy v1 proof (unsalted)";
const V2_LABEL = "v2 (salted tiles)";
const REDACTION_LABEL = "Redaction proof (v2 salted tiles)";

/**
 * Connects to the first reachable RPC that reports Polygon Amoy. Returns
 * "wrong-chain" if an endpoint answers for another chain (reported as
 * UNTRUSTED, not retried), throws if none is reachable.
 */
async function connectAmoy(rpcUrl: string): Promise<{ provider: JsonRpcProvider } | { wrongChain: string }> {
  const urls = rpcUrl === DEFAULT_RPC_URL ? [rpcUrl, ...FALLBACK_RPC_URLS.filter((u) => u !== rpcUrl)] : [rpcUrl];
  let lastErr: unknown;
  for (const url of urls) {
    const provider = new JsonRpcProvider(url, Network.from(TRUSTED_CHAIN_ID), { batchMaxCount: 1, staticNetwork: true });
    try {
      const chainId = Number(await provider.send("eth_chainId", []));
      if (chainId !== TRUSTED_CHAIN_ID) return { wrongChain: `rpc chain_id=${chainId} expected=${TRUSTED_CHAIN_ID}` };
      return { provider };
    } catch (err) {
      lastErr = err;
      provider.destroy();
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No Polygon RPC endpoint reachable.");
}

interface CertificateParams {
  versionId: string;
  commitment: string;
  txHash: string;
}

type CertificateResult =
  | { outcome: "checking" }
  | { outcome: "anchored"; anchoredAt: string; blockNumber: number; contract: string }
  | { outcome: "untrusted" | "mismatch"; reason: string; detail?: string };

function readCertificateParams(): CertificateParams | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const versionId = q.get("v");
  const commitment = q.get("c")?.toLowerCase().replace(/^0x/, "");
  const txHash = q.get("tx")?.toLowerCase();
  if (!versionId || !commitment || !txHash) return null;
  return { versionId, commitment, txHash };
}

/** Chain-only check of a certificate's (versionId, commitment, txHash). Never touches files, MinIO or the backend. */
async function checkCertificate(params: CertificateParams, rpcUrl: string): Promise<CertificateResult> {
  if (!/^[0-9a-f]{64}$/.test(params.commitment) || !/^0x[0-9a-f]{64}$/.test(params.txHash)) {
    return { outcome: "mismatch", reason: "The verification link is malformed." };
  }
  const conn = await connectAmoy(rpcUrl);
  if ("wrongChain" in conn) return { outcome: "untrusted", reason: "Invalid — the RPC endpoint is not Polygon Amoy.", detail: conn.wrongChain };
  const { provider } = conn;
  try {
    // The tx named on the certificate tells us which official contract to read.
    const receipt = await provider.getTransactionReceipt(params.txHash);
    if (!receipt || receipt.status !== 1) return { outcome: "mismatch", reason: "The transaction on the certificate was not found or failed." };
    const official = officialContract(receipt.to);
    if (!official) {
      return { outcome: "untrusted", reason: "Invalid — the certificate's transaction was not sent to an official DigiVault contract.", detail: `to=${receipt.to}` };
    }

    const anchor = await readOfficialAnchor(provider, official, params.versionId);
    if (!anchor.found) return { outcome: "mismatch", reason: "No anchor found on-chain for this document version." };
    if (!anchor.trusted) return { outcome: "untrusted", reason: anchor.reason, detail: `anchoredBy=${anchor.anchoredBy}` };
    if (anchor.value !== params.commitment) {
      return { outcome: "mismatch", reason: "The certificate's commitment does not match the public blockchain record.", detail: `certificate=${params.commitment} on_chain=${anchor.value}` };
    }

    // The tx must be the one that wrote this anchor.
    const key = keccak256(toUtf8Bytes(params.versionId));
    const iface = new Interface(official.abi);
    const wroteThisAnchor = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== official.address.toLowerCase()) return false;
      const parsed = iface.parseLog(log);
      return (
        parsed?.name === official.event.name &&
        String(parsed.args[official.event.key]).toLowerCase() === key.toLowerCase() &&
        String(parsed.args[official.event.value]).replace(/^0x/, "").toLowerCase() === params.commitment
      );
    });
    if (!wroteThisAnchor) return { outcome: "mismatch", reason: "The certificate's transaction did not write this anchor." };

    return { outcome: "anchored", anchoredAt: new Date(anchor.timestamp * 1000).toISOString(), blockNumber: receipt.blockNumber, contract: official.label };
  } finally {
    provider.destroy();
  }
}

interface ProofFileV1 {
  digivault_proof_version: 1;
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

type ProofFile = ProofFileV1 | ProofFileV2;

/** The value the proof says is anchored: C for v2, the merkle root for v1. */
function claimedAnchor(proof: ProofFile): string {
  return (proof.digivault_proof_version === 2 ? proof.commitment : proof.merkle_root).toLowerCase();
}

interface AnchorSummary {
  anchoredAt: string;
  contract: OfficialContract;
}

type Result =
  | { outcome: "idle" }
  | { outcome: "checking" }
  | { outcome: "verified"; proof: ProofFile; contract: OfficialContract }
  | {
      outcome: "redaction-verified";
      proof: RedactionProof;
      check: RedactionCheck;
      files: File[];
      original: AnchorSummary;
      redacted: AnchorSummary;
    }
  | { outcome: "untrusted"; reason: string; detail?: string }
  | { outcome: "mismatch"; reason: string; detail?: string };

function shortHash(value: string): string {
  if (value.length <= 28) return value;
  return `${value.slice(0, 16)}...${value.slice(-8)}`;
}

const VERIFY_CSS = `
.vf { min-height: 100vh; background: var(--ink); color: var(--paper); }
.vf *, .vf *::before, .vf *::after { box-sizing: border-box; }
.vf a:focus-visible, .vf button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.vf-header { height: 60px; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: var(--ink); border-bottom: 1px solid var(--line-2); }
.vf-home { display: inline-flex; align-items: center; gap: 10px; color: var(--paper); text-decoration: none; }
.vf-header-link { margin-left: auto; font-size: 14px; color: var(--paper-3); text-decoration: none; transition: color 120ms ease; }
.vf-header-link:hover { color: var(--paper); }
.vf-brand-name { font-weight: 600; font-size: 15px; letter-spacing: -0.02em; line-height: 1.1; }
.vf-brand-sub { margin-top: 2px; font-family: var(--font-mono), monospace; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper-4); }
.vf-main { max-width: 640px; margin: 0 auto; padding: 72px 20px 80px; }
.vf-eyebrow { margin: 0 0 14px; font-family: var(--font-mono), monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper-4); }
.vf-title { margin: 0; font-size: clamp(30px, 4.6vw, 40px); font-weight: 500; letter-spacing: -0.025em; line-height: 1.1; }
.vf-lede { margin: 12px 0 0; font-size: 15.5px; line-height: 1.6; color: var(--paper-3); }
.vf-card { margin-top: 36px; padding: 20px; border: 1px solid var(--line-2); border-radius: 12px; display: grid; gap: 12px; }
.vf-drop { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px dashed var(--line-3); border-radius: 10px; cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease; }
.vf-drop:hover { border-color: var(--paper-3); background: var(--ink-3); }
.vf-drop:focus-within { outline: 2px solid var(--brand); outline-offset: 2px; }
.vf-drop-icon { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--line-2); color: var(--paper-2); display: grid; place-items: center; flex: none; }
.vf-drop-label { display: block; font-size: 14.5px; font-weight: 500; color: var(--paper); }
.vf-drop-detail { display: block; margin-top: 2px; font-size: 13px; color: var(--paper-3); }
.vf-drop-files { display: block; margin-top: 6px; font-family: var(--font-mono), monospace; font-size: 12px; color: var(--paper-2); overflow-wrap: anywhere; }
.vf-drop-empty { display: block; margin-top: 6px; font-size: 12.5px; color: var(--paper-4); }
.vf-advanced { justify-self: start; background: none; border: 0; padding: 2px 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--paper-3); cursor: pointer; transition: color 120ms ease; }
.vf-advanced:hover { color: var(--paper); }
.vf-input { display: block; width: 100%; margin-top: 6px; height: 40px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 10px; font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: var(--paper); background: var(--ink-3); }
.vf-input:focus-visible { outline: none; border-color: var(--paper-3); box-shadow: 0 0 0 3px rgba(242,239,233,0.08); }
.vf-primary { height: 44px; margin-top: 4px; border: 1px solid var(--paper); border-radius: 10px; background: var(--paper); color: var(--ink); font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; transition: background-color 120ms ease; }
.vf-primary:hover:not(:disabled) { background: #ffffff; border-color: #ffffff; }
.vf-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.vf-result { margin-top: 16px; padding: 18px 20px; border-radius: 12px; border: 1px solid; animation: vf-in 180ms ease-out; }
.vf-result-row { display: flex; gap: 14px; align-items: center; }
.vf-result h2 { margin: 0; font-size: 17px; font-weight: 500; letter-spacing: -0.01em; }
.vf-result p { margin: 4px 0 0; font-size: 14px; color: var(--paper-2); }
.vf-ok { border-color: var(--ok-line); }
.vf-ok h2 { color: var(--ok); }
.vf-bad { background: var(--danger-soft); border-color: var(--danger-line); }
.vf-bad h2 { color: var(--danger); }
.vf-checking { border-color: var(--line-2); }
.vf-untrusted { border-color: var(--danger); background: var(--danger-soft); }
.vf-official { margin-top: 14px; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-height: 26px; padding: 4px 10px; max-width: 100%; border-radius: 6px; border: 1px solid var(--ok-line); color: var(--ok); font-size: 12.5px; font-weight: 500; }
.vf-facts { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line-2); display: grid; gap: 8px; font-size: 13.5px; color: var(--paper-2); }
.vf-code { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: var(--paper); }
.vf-detail { margin: 12px 0 0; font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--paper-3); overflow-wrap: anywhere; }
.vf-pages { margin-top: 14px; display: grid; gap: 6px; font-size: 13.5px; color: var(--paper); }
.vf-previews { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.vf-preview { margin: 0; }
.vf-preview-box { position: relative; }
.vf-preview img { display: block; width: 100%; height: auto; border: 1px solid var(--line-2); border-radius: 6px; background: #fff; }
.vf-preview svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.vf-preview figcaption { margin-top: 4px; font-size: 12px; color: var(--paper-3); }
.vf-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line-2); border-top-color: var(--paper-2); animation: vf-spin 900ms linear infinite; flex: none; }
@keyframes vf-spin { to { transform: rotate(360deg); } }
@keyframes vf-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .vf-result, .vf-pages { margin-top: 14px; display: grid; gap: 6px; font-size: 13.5px; color: var(--paper); }
.vf-previews { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.vf-preview { margin: 0; }
.vf-preview-box { position: relative; }
.vf-preview img { display: block; width: 100%; height: auto; border: 1px solid var(--line-2); border-radius: 6px; background: #fff; }
.vf-preview svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.vf-preview figcaption { margin-top: 4px; font-size: 12px; color: var(--paper-3); }
.vf-spinner { animation: none; } }
@media (max-width: 560px) { .vf-header { padding: 0 16px; } .vf-main { padding-top: 48px; } .vf-title { font-size: 28px; } }
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

/** A redacted page with its masked tiles outlined. */
function MaskedPagePreview({ file, proof, page }: { file: File; proof: RedactionProof; page: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const p = proof.pages[page];
  const rects = tileRects(p.width, p.height, proof.gridSize);
  return (
    <figure className="vf-preview">
      <div className="vf-preview-box">
        {url && <img src={url} alt={`Redacted page ${page + 1}`} />}
        <svg viewBox={`0 0 ${p.width} ${p.height}`} preserveAspectRatio="none" aria-hidden="true">
          {p.masked.map((k) =>
            rects[k].w > 0 && rects[k].h > 0 ? (
              <rect key={k} x={rects[k].x} y={rects[k].y} width={rects[k].w} height={rects[k].h} fill="none" stroke="#f59e0b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ) : null
          )}
        </svg>
      </div>
      <figcaption>Page {page + 1} · masked areas outlined</figcaption>
    </figure>
  );
}

export default function VerifyPage() {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [pngFiles, setPngFiles] = useState<File[]>([]);
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult] = useState<Result>({ outcome: "idle" });
  const [certParams, setCertParams] = useState<CertificateParams | null>(null);
  const [certResult, setCertResult] = useState<CertificateResult | null>(null);

  // Certificate QR link: check the anchor straight away, chain only.
  useEffect(() => {
    const params = readCertificateParams();
    if (!params) return;
    setCertParams(params);
    setCertResult({ outcome: "checking" });
    checkCertificate(params, DEFAULT_RPC_URL)
      .then(setCertResult)
      .catch((err) =>
        setCertResult({ outcome: "mismatch", reason: "The blockchain record could not be checked.", detail: err instanceof Error ? err.message : String(err) })
      );
  }, []);

  /** Reads one version's anchor from the official contract the proof names (which must be official). */
  async function officialAnchorFor(
    provider: JsonRpcProvider,
    v: RedactionProof["original"],
    expected: string,
    name: string
  ): Promise<{ ok: AnchorSummary } | { fail: Result }> {
    if (Number(v.anchor?.chainId) !== TRUSTED_CHAIN_ID) {
      return { fail: { outcome: "untrusted", reason: `Invalid — the ${name} anchor references an untrusted chain.`, detail: `chain_id=${v.anchor?.chainId}` } };
    }
    const official = officialContract(v.anchor?.contractAddress);
    if (!official) {
      return { fail: { outcome: "untrusted", reason: `Invalid — the ${name} anchor references an untrusted contract.`, detail: `contract=${v.anchor?.contractAddress}` } };
    }
    const anchor = await readOfficialAnchor(provider, official, v.versionId);
    if (!anchor.found) return { fail: { outcome: "mismatch", reason: `No anchor found on-chain for the ${name} version.`, detail: `version=${v.versionId}` } };
    if (!anchor.trusted) return { fail: { outcome: "untrusted", reason: anchor.reason, detail: `${name} anchoredBy=${anchor.anchoredBy}` } };
    if (anchor.value !== expected) {
      return {
        fail: {
          outcome: "mismatch",
          reason: `The ${name} version's commitment does not match the public Polygon Amoy record.`,
          detail: `recomputed=${expected} on_chain=${anchor.value}`,
        },
      };
    }
    return { ok: { anchoredAt: new Date(anchor.timestamp * 1000).toISOString(), contract: official } };
  }

  async function verifyRedaction(proof: RedactionProof) {
    if (proof.format !== REDACTION_PROOF_FORMAT) {
      setResult({ outcome: "mismatch", reason: `Unsupported proof format (${String(proof.format)}).` });
      return;
    }
    const invalid = invalidRedactionProof(proof);
    if (invalid) throw new Error(`Redaction proof is malformed: ${invalid}.`);
    if (certParams && ![proof.redacted.versionId, proof.original.versionId].includes(certParams.versionId)) {
      setResult({
        outcome: "mismatch",
        reason: "This redaction proof is for a different document version than the certificate link.",
        detail: `link=${certParams.versionId} proof=${proof.redacted.versionId}`,
      });
      return;
    }

    // 1. Local: masked tiles solid, unmasked tiles the original's, both commitments recomputed.
    const r = await recomputeRedaction(proof, pngFiles);
    const problem = describeRedactionProblem(proof, r);
    if (problem) {
      setResult({
        outcome: "mismatch",
        reason: problem,
        detail: `original: recomputed=${r.check.originalCommitment} proof=${proof.original.commitment}; redacted: recomputed=${r.check.redactedCommitment} proof=${proof.redacted.commitment}`,
      });
      return;
    }

    // 2. Chain: both recomputed commitments against the official contracts.
    const conn = await connectAmoy(rpcUrl);
    if ("wrongChain" in conn) {
      setResult({ outcome: "untrusted", reason: "Invalid — the RPC endpoint is not Polygon Amoy.", detail: conn.wrongChain });
      return;
    }
    const { provider } = conn;
    try {
      const original = await officialAnchorFor(provider, proof.original, r.check.originalCommitment, "original");
      if ("fail" in original) return setResult(original.fail);
      const redacted = await officialAnchorFor(provider, proof.redacted, r.check.redactedCommitment, "redacted");
      if ("fail" in redacted) return setResult(redacted.fail);
      setResult({ outcome: "redaction-verified", proof, check: r.check, files: r.orderedFiles, original: original.ok, redacted: redacted.ok });
    } finally {
      provider.destroy();
    }
  }

  async function handleVerify() {
    setResult({ outcome: "checking" });
    try {
      if (!proofFile) throw new Error("No proof JSON file provided.");
      if (pngFiles.length === 0) throw new Error("No page PNG file(s) provided.");

      const parsed = JSON.parse(await proofFile.text());
      if (parsed && typeof parsed === "object" && "format" in parsed) {
        await verifyRedaction(parsed as RedactionProof);
        return;
      }
      const proof = parsed as ProofFile;
      if (!SUPPORTED_PROOF_VERSIONS.includes(Number(proof.digivault_proof_version))) {
        setResult({
          outcome: "mismatch",
          reason: `Unsupported proof format (digivault_proof_version ${proof.digivault_proof_version}).`,
        });
        return;
      }
      // Normalise "2" to 2 so every later branch dispatches the same way.
      proof.digivault_proof_version = Number(proof.digivault_proof_version) as ProofFile["digivault_proof_version"];
      if (proof.digivault_proof_version === 2) {
        const invalid = invalidProofV2(proof);
        if (invalid) throw new Error(`Proof file is malformed: ${invalid}.`);
      } else if (!proof.merkle_root || !proof.document_version_id) {
        throw new Error("Proof file is missing required fields.");
      }
      if (certParams && certParams.versionId !== proof.document_version_id) {
        setResult({
          outcome: "mismatch",
          reason: "This proof file is for a different document version than the certificate link.",
          detail: `link=${certParams.versionId} proof=${proof.document_version_id}`,
        });
        return;
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
      const official = officialContract(proof.anchor?.contract_address);
      if (!official) {
        setResult({
          outcome: "untrusted",
          reason: "Invalid — proof references an untrusted contract.",
          detail: `proof contract=${proof.anchor?.contract_address} official=${OFFICIAL_CONTRACTS.map((c) => c.address).join(",")}`,
        });
        return;
      }

      // 1. Recompute the anchored value from the PNG(s) actually supplied —
      // identical algorithm to packages/crypto-core (see docs/03), no
      // dependency on anything the backend claims about them.
      let recomputed: string;
      let mismatchReason: string;
      if (proof.digivault_proof_version === 2) {
        // v2: salted leaves -> page roots -> R -> C = H(0x03 ‖ fileHash ‖ R).
        const r = await recomputeV2(proof, pngFiles);
        recomputed = r.commitment;
        mismatchReason = describeV2Mismatch(proof, r);
      } else {
        // Legacy v1: unsalted leaves, merkletreejs (read-only, ADR-021).
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
        recomputed = buildMerkleTree(allTiles).rootHex;
        mismatchReason = "The supplied page image(s) do not hash to the root stated in the proof file.";
      }

      const claimed = claimedAnchor(proof);
      const localMatch = recomputed === claimed;

      // 2. Check the recomputed root against the public Polygon Amoy
      // record directly — the only source of truth that matters here.
      // The RPC endpoint is user-editable (advanced options), so confirm it
      // actually serves Polygon Amoy before trusting anything it returns.
      const conn = await connectAmoy(rpcUrl);
      if ("wrongChain" in conn) {
        setResult({ outcome: "untrusted", reason: "Invalid — the RPC endpoint is not Polygon Amoy.", detail: conn.wrongChain });
        return;
      }
      const { provider } = conn;
      let anchor: OnChainAnchor;
      try {
        anchor = await readOfficialAnchor(provider, official, proof.document_version_id);
      } finally {
        provider.destroy();
      }

      if (!anchor.found) {
        setResult({ outcome: "mismatch", reason: "No anchor found on-chain for this document version." });
        return;
      }
      if (!anchor.trusted) {
        setResult({ outcome: "untrusted", reason: anchor.reason, detail: `anchoredBy=${anchor.anchoredBy} contract=${official.address}` });
        return;
      }
      const onChainRoot = anchor.value;

      const onChainMatch = onChainRoot === claimed;

      if (localMatch && onChainMatch) {
        setResult({ outcome: "verified", proof, contract: official });
      } else if (!localMatch) {
        setResult({
          outcome: "mismatch",
          reason: mismatchReason,
          detail: `recomputed=${recomputed} proof=${claimed}`,
        });
      } else {
        setResult({
          outcome: "mismatch",
          reason: "The proof file's root does not match the public Polygon Amoy record.",
          detail: `proof=${claimed} on_chain=${onChainRoot}`,
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
    <div className={`vf ${fontClass}`}>
      <style>{VERIFY_CSS}</style>
      <header className="vf-header">
        <Link href="/" className="vf-home">
          <BrandMark size={26} />
          <div>
            <div className="vf-brand-name">DigiVault</div>
            <div className="vf-brand-sub">Public verification</div>
          </div>
        </Link>
        <Link href="/" className="vf-header-link">
          About DigiVault
        </Link>
      </header>

      <main className="vf-main">
        <p className="vf-eyebrow">Public court verification</p>
        <h1 className="vf-title">Court Document Verification</h1>
        <p className="vf-lede">Independent verification - no account required, no connection to DigiVault servers.</p>

        {certParams && certResult && (
          <div
            className={`result-card vf-result ${certResult.outcome === "anchored" ? "vf-ok" : certResult.outcome === "checking" ? "vf-checking" : "vf-bad"}`}
            role="status"
            data-testid="certificate-check"
          >
            {certResult.outcome === "checking" && (
              <div className="vf-result-row">
                <span className="vf-spinner" aria-hidden="true" />
                <strong>Checking the certificate against the blockchain record...</strong>
              </div>
            )}
            {certResult.outcome === "anchored" && (
              <>
                <h2>Anchored: this certificate&apos;s commitment is on the public blockchain</h2>
                <p style={{ color: "var(--paper)" }}>
                  The commitment and transaction on this certificate match the official DigiVault record. No document file has been
                  checked yet: add the page images and proof file below to verify the document itself.
                </p>
                <p className="vf-detail">{CERTIFICATE_QR_STATEMENT}</p>
                <div className="vf-facts">
                  <div>document_version_id: <code className="vf-code">{certParams.versionId}</code></div>
                  <div>commitment: <code title={certParams.commitment} className="vf-code">{shortHash(certParams.commitment)}</code></div>
                  <div>
                    transaction:{" "}
                    <a href={`https://amoy.polygonscan.com/tx/${certParams.txHash}`} target="_blank" rel="noreferrer" className="vf-code">
                      {shortHash(certParams.txHash)}
                    </a>{" "}
                    (block {certResult.blockNumber})
                  </div>
                  <div>anchored_at: <code className="vf-code">{certResult.anchoredAt}</code></div>
                  <div>contract: <code className="vf-code">{certResult.contract}</code></div>
                </div>
              </>
            )}
            {(certResult.outcome === "untrusted" || certResult.outcome === "mismatch") && (
              <>
                <h2>{certResult.outcome === "untrusted" ? certResult.reason : "Certificate does not match the blockchain record"}</h2>
                {certResult.outcome === "mismatch" && <p style={{ color: "var(--paper)" }}>{certResult.reason}</p>}
                {certResult.detail && <p className="vf-detail">{certResult.detail}</p>}
              </>
            )}
          </div>
        )}

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
            detail="verification-proof.json from the bundle, or redaction-proof.json for a redacted copy."
            accept="application/json"
            filenames={proofFile ? [proofFile.name] : []}
            onChange={(files) => setProofFile(files?.[0] ?? null)}
          />

          <button type="button" className="vf-advanced" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>
          {showAdvanced && (
            <label style={{ fontSize: 13.5, fontWeight: 600, color: "var(--paper)" }}>
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
                <circle cx="12" cy="12" r="10" fill="#10b981" />
                <path d="m7 12 3 3 7-7" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h2>Verified - matches public blockchain record</h2>
                <p style={{ color: "var(--paper)" }}>
                  The supplied document pages match the public Polygon Amoy anchor.
                  {certParams && certResult?.outcome === "anchored" && " They are the document version the scanned certificate describes."}
                </p>
              </div>
            </div>
            <div className="vf-facts">
              {result.proof.digivault_proof_version === 2 ? (
                <>
                  <div>commitment: <code title={result.proof.commitment} className="vf-code">{shortHash(result.proof.commitment)}</code></div>
                  <div>document_root: <code title={result.proof.document_root} className="vf-code">{shortHash(result.proof.document_root)}</code></div>
                </>
              ) : (
                <div>merkle_root: <code title={result.proof.merkle_root} className="vf-code">{shortHash(result.proof.merkle_root)}</code></div>
              )}
              <div>
                polygon_tx_hash:{" "}
                <a href={`https://amoy.polygonscan.com/tx/${result.proof.anchor.polygon_tx_hash}`} target="_blank" rel="noreferrer" className="vf-code">
                  {shortHash(result.proof.anchor.polygon_tx_hash)}
                </a>
              </div>
              <div>anchored_at: <code className="vf-code">{result.proof.anchor.anchored_at}</code></div>
              <div data-testid="proof-format">
                proof format: <code className="vf-code">{result.proof.digivault_proof_version === 1 ? LEGACY_V1_LABEL : V2_LABEL}</code>
              </div>
            </div>
            <div className="vf-official">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3.5 19 6.3v5.2c0 4.4-2.8 7.5-7 9-4.2-1.5-7-4.6-7-9V6.3l7-2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verified against official DigiVault contract
              <a href={`https://amoy.polygonscan.com/address/${result.contract.address}`} target="_blank" rel="noreferrer" className="vf-code">
                {result.contract.label} {shortHash(result.contract.address)}
              </a>
            </div>
          </div>
        )}

        {result.outcome === "redaction-verified" && (
          <div className="result-card vf-result vf-ok" role="status" data-testid="redaction-verified">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#10b981" />
                <path d="m7 12 3 3 7-7" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h2>Verified redacted copy - matches the original public blockchain record</h2>
                <p style={{ color: "var(--paper)" }}>
                  Apart from the masked areas, these pages are the original document anchored on {result.original.anchoredAt.slice(0, 10)}, unchanged.
                </p>
              </div>
            </div>
            <div className="vf-pages" data-testid="redaction-pages">
              {result.check.pages.map((p) => (
                <div key={p.page}>
                  {p.tileCount - p.maskedCount} of {p.tileCount} tiles on page {p.page + 1} are byte-identical to the original anchored on{" "}
                  {result.original.anchoredAt.slice(0, 10)} · {p.maskedCount} masked · nothing else changed
                </div>
              ))}
            </div>
            <div className="vf-previews">
              {result.files.map((f, i) => (
                <MaskedPagePreview key={i} file={f} proof={result.proof} page={i} />
              ))}
            </div>
            <div className="vf-facts">
              <div>original version: <code className="vf-code">{result.proof.original.versionId}</code> (v{result.proof.original.versionNo})</div>
              <div>original commitment: <code title={result.proof.original.commitment} className="vf-code">{shortHash(result.proof.original.commitment)}</code></div>
              <div>
                original anchor:{" "}
                <a href={`https://amoy.polygonscan.com/tx/${result.proof.original.anchor.txHash}`} target="_blank" rel="noreferrer" className="vf-code">
                  {shortHash(result.proof.original.anchor.txHash)}
                </a>{" "}
                on {result.original.contract.label}, {result.original.anchoredAt}
              </div>
              <div>redacted version: <code className="vf-code">{result.proof.redacted.versionId}</code> (v{result.proof.redacted.versionNo})</div>
              <div>redacted commitment: <code title={result.proof.redacted.commitment} className="vf-code">{shortHash(result.proof.redacted.commitment)}</code></div>
              <div>
                redacted anchor:{" "}
                <a href={`https://amoy.polygonscan.com/tx/${result.proof.redacted.anchor.txHash}`} target="_blank" rel="noreferrer" className="vf-code">
                  {shortHash(result.proof.redacted.anchor.txHash)}
                </a>{" "}
                on {result.redacted.contract.label}, {result.redacted.anchoredAt}
              </div>
              <div data-testid="proof-format">
                proof format: <code className="vf-code">{REDACTION_LABEL}</code>
              </div>
            </div>
            <div className="vf-official">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3.5 19 6.3v5.2c0 4.4-2.8 7.5-7 9-4.2-1.5-7-4.6-7-9V6.3l7-2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verified against official DigiVault contract
            </div>
          </div>
        )}

        {result.outcome === "untrusted" && (
          <div className="result-card vf-result vf-bad vf-untrusted" role="alert">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.5 1.8 20.5h20.4L12 2.5Z" fill="#dc2626" />
                <path d="M12 9.5v5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="17.3" r="1.2" fill="#FFFFFF" />
              </svg>
              <div>
                <h2>{result.reason}</h2>
                <p style={{ color: "var(--paper)" }}>This proof was not checked against the official DigiVault record. Treat the document as unverified.</p>
              </div>
            </div>
            {result.detail && <p className="vf-detail">{result.detail}</p>}
          </div>
        )}

        {result.outcome === "mismatch" && (
          <div className="result-card vf-result vf-bad" role="alert">
            <div className="vf-result-row">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#dc2626" />
                <path d="m8 8 8 8M16 8l-8 8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <div>
                <h2>Mismatch - do not trust this document</h2>
                <p style={{ color: "var(--paper)" }}>{result.reason}</p>
              </div>
            </div>
            {result.detail && <p className="vf-detail">{result.detail}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
