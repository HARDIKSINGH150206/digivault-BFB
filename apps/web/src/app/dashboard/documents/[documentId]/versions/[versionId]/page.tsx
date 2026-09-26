"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "@/lib/client/require-auth";
import { apiFetch, apiJson } from "@/lib/client/api-client";
import { SharePanel } from "@/components/SharePanel";
import { IntegrityRadar } from "@/components/IntegrityRadar";
import { manrope, inter } from "@/lib/client/fonts";
import { CornerBracket } from "@/lib/client/corner-bracket";

interface VersionInfo {
  document_id: string;
  document_version_id: string;
  document_title: string;
  case_id: string;
  case_number: string;
  version_no: number;
  grid_size: number;
  tile_count: number;
  status: string;
  merkle_root: string;
  client_hash: string;
  chain_hash: string;
  previous_hash: string | null;
  storage_uri: string;
  is_current_version: boolean;
  created_at: string;
  anchor: { status: string; object_lock_uri: string; polygon_tx_hash: string | null; anchored_at: string } | null;
}

interface Suggestion {
  id: string;
  tile_index: number;
  page_index: number;
  row: number;
  col: number;
  entity_type: string;
  confidence_score: number;
  source: string;
  masked: boolean;
}

const CARD_STYLE: React.CSSProperties = {
  position: "relative",
  background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
  border: "1px solid #1f2937",
  borderRadius: 8,
  padding: 22,
  boxShadow: "0 0 0 1px rgba(74,144,196,0.05), 0 0 40px rgba(30,80,160,0.10)",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function truncateHash(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function statusBadgeColors(status: string): { bg: string; fg: string } {
  if (status === "READY") return { bg: "#22c55e", fg: "#052e14" };
  if (status === "FAILED") return { bg: "#ef4444", fg: "#450a0a" };
  return { bg: "#f59e0b", fg: "#451a03" };
}

const ENTITY_PILL_STYLE: Record<string, { background: string; color: string }> = {
  victim_name: { background: "#7f1d1d", color: "#fca5a5" },
  witness_name: { background: "#1e3a5f", color: "#93c5fd" },
  relative_name: { background: "#3b1f5e", color: "#c4b5fd" },
  address: { background: "#1a2e1a", color: "#86efac" },
  phone: { background: "#1f2937", color: "#d1d5db" },
  age: { background: "#1a1a2e", color: "#a5b4fc" },
};
const DEFAULT_ENTITY_PILL_STYLE = { background: "#1f2937", color: "#9ca3af" };

function confidenceBarColor(score: number): string {
  if (score >= 0.85) return "#22c55e";
  if (score >= 0.5) return "#f59e0b";
  return "#ef4444";
}

function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid #1f2937",
        background: "#0a0f1a",
        color: "#cbd5e1",
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid rgba(59,130,246,0.12)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>{label}</div>
        <code
          title="Click to copy full value"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          style={{ display: "block", marginTop: 4, color: "#6b7280", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}
        >
          {copied ? "Copied!" : truncateHash(value)}
        </code>
      </div>
      {value && (
        <span
          style={{
            flexShrink: 0,
            border: "1px solid rgba(34,197,94,0.4)",
            background: "rgba(34,197,94,0.1)",
            color: "#22c55e",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          VERIFIED ✓
        </span>
      )}
    </div>
  );
}

function SuggestionRow({
  s,
  checked,
  disabled,
  onToggle,
}: {
  s: Suggestion;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const percent = Math.round(s.confidence_score * 100);
  const barColor = confidenceBarColor(s.confidence_score);
  const entityStyle = ENTITY_PILL_STYLE[s.entity_type] ?? DEFAULT_ENTITY_PILL_STYLE;
  const borderLeft =
    s.confidence_score >= 0.85 ? "3px solid #22c55e" : s.confidence_score < 0.5 ? "3px solid #f59e0b" : "1px solid #2d3748";

  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "24px auto auto 1fr",
        gap: 14,
        alignItems: "center",
        background: "#1a1f2e",
        border: "1px solid #2d3748",
        borderLeft,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <input className="tile-check" type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} />
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          background: "#0f172a",
          color: "#60a5fa",
          borderRadius: 6,
          padding: "5px 9px",
          whiteSpace: "nowrap",
        }}
      >
        P{s.page_index} · R{s.row} · C{s.col}
      </span>
      <span
        style={{
          display: "inline-flex",
          justifySelf: "start",
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
          ...entityStyle,
        }}
      >
        {s.entity_type}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
        <div style={{ width: 80, height: 6, background: "#0a0f1a", borderRadius: 999, overflow: "hidden", border: "1px solid #1f2937" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: barColor }} />
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: barColor, minWidth: 34 }}>{percent}%</span>
        <span style={{ background: "#1f2937", color: "#9ca3af", fontSize: 11, borderRadius: 999, padding: "3px 8px" }}>{s.source}</span>
      </div>
    </li>
  );
}

function VersionDetailContent() {
  const { documentId, versionId } = useParams<{ documentId: string; versionId: string }>();
  const router = useRouter();

  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsStatus, setSuggestionsStatus] = useState<string>("PENDING");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchorMessage, setAnchorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, s] = await Promise.all([
      apiJson<VersionInfo>(`/api/v1/documents/${documentId}/versions/${versionId}`),
      apiJson<{ status: string; suggestions: Suggestion[] }>(
        `/api/v1/documents/${documentId}/versions/${versionId}/redaction-suggestions`
      ),
    ]);
    setInfo(v);
    setSuggestions(s.suggestions);
    setSuggestionsStatus(s.status);
  }, [documentId, versionId]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  function toggle(tileIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tileIndex)) next.delete(tileIndex);
      else next.add(tileIndex);
      return next;
    });
  }

  async function handleFinalize() {
    setConfirming(true);
    setError(null);
    try {
      const body = await apiJson<{ document_version_id: string }>(
        `/api/v1/documents/${documentId}/versions/${versionId}/redactions/confirm`,
        { method: "POST", body: JSON.stringify({ confirmed_tile_indices: Array.from(selected) }) }
      );
      router.push(`/dashboard/documents/${documentId}/versions/${body.document_version_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
      setReviewing(false);
    }
  }

  async function handleAnchor() {
    setAnchoring(true);
    setAnchorMessage(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions/${versionId}/anchor`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setAnchorMessage(`Anchored. Polygon tx: ${body.polygon_tx_hash}`);
      } else {
        setAnchorMessage(`MinIO half succeeded; on-chain anchor failed: ${body.reason ?? body.message}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnchoring(false);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handlePrepareVerificationBundle() {
    setError(null);
    try {
      const proofRes = await apiFetch(`/api/v1/documents/${documentId}/versions/${versionId}/proof`);
      const proof = await proofRes.json();
      if (!proofRes.ok) throw new Error(proof.message ?? "This version has not completed on-chain anchoring yet.");

      triggerDownload(new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" }), "verification-proof.json");

      for (const p of proof.pages as { page_index: number }[]) {
        const pageRes = await apiFetch(
          `/api/v1/documents/${documentId}/versions/${versionId}/pages/${p.page_index}`
        );
        if (!pageRes.ok) throw new Error(`Could not fetch page ${p.page_index}.`);
        triggerDownload(await pageRes.blob(), `page-${p.page_index}.png`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDownloadCertificate() {
    const res = await apiFetch(`/api/v1/documents/${documentId}/versions/${versionId}/certificate`);
    if (!res.ok) {
      setError("Could not generate certificate.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bsa-certificate-v${info?.version_no}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!info) {
    return (
      <main
        className={`${inter.variable} ${manrope.variable} ${inter.className}`}
        style={{ minHeight: "100vh", background: "#0a0f1a", color: "#f9fafb", padding: 24 }}
      >
        <div style={{ maxWidth: 920, margin: "40px auto", background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 24 }}>
          {error ? <p style={{ color: "#ef4444" }}>{error}</p> : <p className="skeleton-pulse" style={{ color: "#9ca3af" }}>Loading...</p>}
        </div>
      </main>
    );
  }

  const anchored = Boolean(info.anchor?.polygon_tx_hash);
  const maskedCount = suggestions.filter((s) => s.masked).length;
  const totalFlags = suggestions.length;
  const statusColors = statusBadgeColors(info.status);

  const radarProps = {
    hashIntegrity: info.client_hash ? 100 : 0,
    chainContinuity: info.previous_hash ? 100 : info.version_no === 1 ? 50 : 0,
    redactionCoverage: totalFlags > 0 ? (maskedCount / totalFlags) * 100 : 0,
    blockchainAnchor: info.anchor?.polygon_tx_hash ? 100 : info.anchor?.object_lock_uri ? 50 : 0,
    aiConfidence: totalFlags > 0 ? (suggestions.reduce((sum, s) => sum + s.confidence_score, 0) / totalFlags) * 100 : 0,
  };

  return (
    <main
      className={`${inter.variable} ${manrope.variable} ${inter.className}`}
      style={{
        color: "#e2e8f0",
        backgroundColor: "#0a0f1a",
        minHeight: "100vh",
        maxWidth: 1600,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <style>{`
        .hash-row:hover .copy-btn { opacity: 1 !important; }
        .tile-check { width: 18px; height: 18px; accent-color: #3b82f6; transition: transform 150ms ease; }
        .tile-check:checked { transform: scale(1.08); }
        @keyframes statusPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.28); } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0); } }
        @keyframes skeletonPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        .status-processing { animation: statusPulse 1.8s ease-in-out infinite; }
        .skeleton-pulse { animation: skeletonPulse 1.4s ease-in-out infinite; }
        .version-detail-grid { display: grid; grid-template-columns: minmax(0,3fr) minmax(0,2fr); gap: 24px; align-items: start; }
        .version-detail-right { position: sticky; top: 24px; display: grid; gap: 18px; }
        @media (max-width: 1200px) {
          .version-detail-grid { grid-template-columns: 1fr !important; }
          .version-detail-right { position: static !important; }
        }
      `}</style>

      <p style={{ margin: "0 0 18px", display: "flex", gap: 14, fontSize: 13 }}>
        <Link href={`/dashboard/cases/${info.case_id}`} style={{ color: "#60a5fa", textDecoration: "none" }}>Back to case</Link>
        <Link href="/dashboard" style={{ color: "#9ca3af", textDecoration: "none" }}>Cases</Link>
      </p>

      <div className="version-detail-grid">
        <div style={{ display: "grid", gap: 18 }}>
          <section style={{ ...CARD_STYLE, padding: "20px 22px" }}>
            <CornerBracket corner="tl" />
            <CornerBracket corner="br" />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: "0 0 8px", color: "#60a5fa", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{info.case_number}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "#f9fafb", fontFamily: "var(--font-display)", lineHeight: 1 }}>
                    v{info.version_no}
                  </span>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#e2e8f0" }}>{info.document_title}</h1>
                </div>
                <p style={{ margin: "10px 0 0", color: "#9ca3af", fontSize: 13 }}>
                  Uploaded {relativeTime(info.created_at)} · Grid {info.grid_size}×{info.grid_size} · {info.tile_count} tiles
                </p>
                {!info.is_current_version && <p style={{ margin: "8px 0 0", color: "#f59e0b", fontSize: 13 }}>Superseded by a newer version</p>}
              </div>
              <span
                className={info.status === "PROCESSING" ? "status-processing" : ""}
                style={{ background: statusColors.bg, color: statusColors.fg, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 800 }}
              >
                {info.status}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
              <StatPill>🔗 {info.version_no} version(s)</StatPill>
              <StatPill>🧩 {totalFlags} suggestions</StatPill>
              <StatPill>✅ {maskedCount} confirmed</StatPill>
              <StatPill>⚓ {anchored ? "Anchored" : "Not anchored"}</StatPill>
            </div>
          </section>

          <section style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderLeft: "3px solid #3b82f6", borderRadius: 8, padding: 22 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "#f9fafb", display: "flex", alignItems: "center", gap: 8 }}>
              <span aria-hidden>🛡️</span> Cryptographic Integrity
            </h2>
            <div style={{ marginTop: 14 }}>
              <HashRow label="Merkle Root" value={info.merkle_root} />
              <HashRow label="Client Hash" value={info.client_hash} />
              <HashRow label="Chain Hash" value={info.chain_hash} />
            </div>
          </section>

          <section style={CARD_STYLE}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>AI-suggested redactions</h2>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#9ca3af" }}>
                  Suggestions never alter the hash; every final redaction requires officer confirmation and recomputation.
                </p>
              </div>
              <span style={{ color: "#9ca3af", fontSize: 12 }}>Status: {suggestionsStatus}</span>
            </div>

            {suggestions.length === 0 && suggestionsStatus === "PENDING" && (
              <p className="skeleton-pulse" style={{ marginTop: 18, color: "#9ca3af" }}>Waiting for AI suggestions...</p>
            )}

            <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "grid", gap: 10 }}>
              {suggestions.map((s) => (
                <SuggestionRow
                  key={s.id}
                  s={s}
                  checked={selected.has(s.tile_index)}
                  disabled={!info.is_current_version}
                  onToggle={() => toggle(s.tile_index)}
                />
              ))}
            </ul>

            {info.is_current_version && suggestions.length > 0 && !reviewing && (
              <button
                style={{
                  marginTop: 18,
                  background: selected.size === 0 ? "#1f2937" : "#3b82f6",
                  color: selected.size === 0 ? "#9ca3af" : "#f9fafb",
                  border: `1px solid ${selected.size === 0 ? "#1f2937" : "#3b82f6"}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontWeight: 800,
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}
                onClick={() => setReviewing(true)}
                disabled={selected.size === 0}
              >
                Review {selected.size} selected redaction{selected.size === 1 ? "" : "s"}
              </button>
            )}

            {reviewing && (
              <div style={{ marginTop: 18, padding: 16, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.45)", borderRadius: 8 }}>
                <h3 style={{ margin: "0 0 8px", color: "#fca5a5", fontSize: 15 }}>Confirm irreversible redaction</h3>
                <p style={{ margin: "0 0 14px", color: "#f9fafb", fontSize: 13, lineHeight: 1.6 }}>
                  This will create a new version with {selected.size} tile{selected.size === 1 ? "" : "s"} permanently masked and a new server-recomputed Merkle root. This action cannot be undone.
                </p>
                <button onClick={handleFinalize} disabled={confirming} style={{ marginRight: 8, background: "#ef4444", color: "#f9fafb", border: "1px solid #ef4444", borderRadius: 6, padding: "9px 12px", fontWeight: 800, cursor: confirming ? "not-allowed" : "pointer" }}>
                  {confirming ? "Finalizing..." : "Yes, finalize redactions"}
                </button>
                <button onClick={() => setReviewing(false)} disabled={confirming} style={{ background: "transparent", color: "#f9fafb", border: "1px solid #1f2937", borderRadius: 6, padding: "9px 12px", cursor: confirming ? "not-allowed" : "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="version-detail-right">
          <IntegrityRadar {...radarProps} />

          <section style={CARD_STYLE}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Anchoring</h2>
            {anchoring && <p className="skeleton-pulse" style={{ color: "#60a5fa", fontSize: 13 }}>Writing to MinIO... then to Polygon Amoy...</p>}

            {anchored ? (
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "12px 16px",
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.4)",
                  borderRadius: 8,
                }}
              >
                <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 13 }}>✓ Anchored to Polygon Amoy</span>
                <a
                  href={`https://amoy.polygonscan.com/tx/${info.anchor!.polygon_tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: 12 }}
                >
                  {truncateHash(info.anchor!.polygon_tx_hash!)}
                </a>
              </div>
            ) : (
              <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8 }}>
                <span style={{ color: "#f59e0b", fontWeight: 800, fontSize: 13 }}>
                  ⚠ Not yet anchored to blockchain{info.anchor?.object_lock_uri ? " (MinIO complete, Polygon pending)" : ""}
                </span>
              </div>
            )}

            <button onClick={handleAnchor} disabled={anchoring} style={{ marginTop: 14, background: anchoring ? "#1f2937" : "#3b82f6", color: "#f9fafb", border: `1px solid ${anchoring ? "#1f2937" : "#3b82f6"}`, borderRadius: 6, padding: "10px 14px", fontWeight: 800, cursor: anchoring ? "not-allowed" : "pointer" }}>
              {anchoring ? "Anchoring..." : "Anchor this version (MinIO + Polygon)"}
            </button>
            {anchorMessage && <p style={{ fontSize: 13, color: anchorMessage.startsWith("Anchored") ? "#10b981" : "#ef4444" }}>{anchorMessage}</p>}
          </section>

          <SharePanel documentId={documentId} versionId={versionId} />
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginTop: 18 }}>
        <div style={CARD_STYLE}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Court Verification Portal bundle</h2>
          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>Downloads the proof JSON and page PNGs needed for independent verification.</p>
          <button
            onClick={handlePrepareVerificationBundle}
            disabled={!anchored}
            title={anchored ? "Download proof JSON and page PNGs" : "Anchor this version first"}
            style={{ background: anchored ? "#3b82f6" : "#1f2937", color: anchored ? "#f9fafb" : "#9ca3af", border: `1px solid ${anchored ? "#3b82f6" : "#1f2937"}`, borderRadius: 6, padding: "10px 14px", fontWeight: 800, cursor: anchored ? "pointer" : "not-allowed" }}
          >
            Download verification bundle
          </button>
        </div>

        <div style={CARD_STYLE}>
          <h2 style={{ margin: 0, fontSize: 17 }}>BSA certificate</h2>
          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>Pre-filled and unsigned - a human still has to sign it.</p>
          <button onClick={handleDownloadCertificate} style={{ background: "#3b82f6", color: "#f9fafb", border: "1px solid #3b82f6", borderRadius: 6, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>
            Download certificate
          </button>
        </div>
      </section>

      {error && <p style={{ color: "#ef4444", marginTop: 18 }}>{error}</p>}
    </main>
  );
}

export default function VersionDetailPage() {
  return (
    <RequireAuth>
      <VersionDetailContent />
    </RequireAuth>
  );
}
