"use client";

/**
 * Document version page, all roles. Each action is shown only to the roles
 * the matching API route accepts (lib/client/permissions.ts). Endpoints:
 *   GET  /api/v1/documents/{d}/versions/{v}                          -> version, hashes, anchor state
 *   GET  /api/v1/documents/{d}/versions/{v}/pages/{i}                -> page PNGs (document viewer; also used by the bundle)
 *   GET  /api/v1/documents/{d}/versions/{v}/redaction-suggestions    -> stored suggestions (only if the role may read them)
 *   POST /api/v1/documents/{d}/versions/{v}/redactions/confirm       -> create redacted version (only if allowed)
 *   POST /api/v1/documents/{d}/versions/{v}/anchor                   -> retry anchoring (only if allowed; step-up required)
 * Anchoring itself runs automatically in the background after upload/confirm;
 * this page polls the version while it is PENDING. Confirm, anchor and
 * certificate require a step-up token (X-StepUp-Token) from useStepUp().
 *   GET  /api/v1/documents/{d}/versions/{v}/proof                    -> verification bundle (only once anchored)
 *   GET  /api/v1/documents/{d}/versions/{v}/certificate              -> pre-filled certificate PDF
 *   GET/POST/DELETE /api/v1/documents/{d}/shares[/{shareId}]         -> share links (only if allowed)
 * Suggestion values (entity, confidence, source) are shown exactly as stored.
 * "Upload new version" opens the upload page with ?document=, which sends
 * document_id to POST /api/v1/evidence/upload (new hash-chained version).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";
import { apiFetch, apiJson } from "@/lib/client/api-client";
import { useStepUp, StepUpCancelled, STEP_UP_HEADER } from "@/lib/client/use-step-up";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon, formatDateTime } from "./shell";
import { WorkspaceSharePanel } from "./share-panel";
import { anchorState, type AnchorInfo } from "./data";
import { CERTIFICATE_QR_STATEMENT } from "@/lib/certificate-text";

interface VersionInfo {
  document_id: string;
  document_version_id: string;
  document_title: string;
  case_id: string;
  case_number: string;
  version_no: number;
  grid_size: number;
  tile_count: number;
  proof_version: number;
  merkle_root: string;
  commitment: string;
  client_hash: string;
  chain_hash: string;
  previous_hash: string | null;
  is_current_version: boolean;
  is_redacted: boolean;
  created_at: string;
  anchor: AnchorInfo | null;
  /** Certificate QR target (ADR-022); null until anchored. */
  public_verify_url: string | null;
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

type PageImage =
  | { status: "loading" }
  | { status: "missing"; httpStatus: number | null }
  | { status: "ready"; url: string; width: number; height: number };

const VERSION_CSS = `
.wsv-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; margin-top: 24px; align-items: start; }
.wsv-side { display: grid; gap: 16px; position: sticky; top: 92px; }
@media (max-width: 1100px) { .wsv-grid { grid-template-columns: minmax(0, 1fr); } .wsv-side { position: static; } }
.wsv-viewer { background: var(--ink-3); border: 1px solid var(--line-2); border-radius: 12px; padding: 24px; display: grid; gap: 24px; justify-items: center; }
.wsv-page { position: relative; width: 100%; max-width: 760px; background: #FFFFFF; box-shadow: 0 30px 80px -30px rgba(0,0,0,0.8); border-radius: 4px; overflow: hidden; }
.wsv-page img { display: block; width: 100%; height: auto; }
.wsv-page-label { font-size: 12.5px; color: var(--paper-3); margin-top: -14px; }
.wsv-page-skeleton { width: 100%; max-width: 760px; aspect-ratio: 0.707; background: var(--ink-4); border-radius: 4px; display: grid; place-items: center; color: var(--paper-4); font-size: 14px; }
.wsv-page-missing { color: var(--danger); background: var(--ink-2); border: 1px dashed var(--danger-line); padding: 24px; text-align: center; }
.wsv-tile { position: absolute; border: 2px solid var(--warn); background: rgba(251,191,36,0.14); border-radius: 2px; padding: 0; cursor: pointer; }
.wsv-tile:hover { background: rgba(251,191,36,0.26); }
.wsv-tile:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.wsv-tile-high { border-color: var(--ok); background: rgba(52,211,153,0.14); }
.wsv-tile-check { border-style: dashed; }
.wsv-tile-selected { border-color: var(--brand); background: rgba(0,0,0,0.8); }
.wsv-tile-selected:hover { background: rgba(0,0,0,0.88); }
.wsv-tile-static { cursor: default; }
.wsv-bands { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.wsv-status { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--line); }
.wsv-status:first-of-type { border-top: 0; }
.wsv-status-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.wsv-status-title { font-size: 14px; font-weight: 500; }
.wsv-status-text { font-size: 13.5px; color: var(--paper-3); margin-top: 2px; }
.wsv-details { margin-top: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
.wsv-details summary { cursor: pointer; font-size: 13.5px; font-weight: 500; color: var(--paper-2); list-style-position: inside; }
.wsv-details summary:hover { color: var(--paper); }
.wsv-details summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 2px; }
.wsv-hash { display: grid; gap: 3px; margin-top: 12px; }
.wsv-hash-label { font-size: 12px; color: var(--paper-4); }
.wsv-hash-value { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--paper); overflow-wrap: anywhere; background: var(--ink-3); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 8px; }
.wsv-sugg-list { list-style: none; margin: 8px 0 0; padding: 0; }
.wsv-sugg { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--line); }
.wsv-sugg input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--brand); flex: none; }
.wsv-sugg label { display: grid; gap: 3px; font-size: 13.5px; color: var(--paper-3); cursor: pointer; }
.wsv-sugg-type { font-size: 14px; font-weight: 500; color: var(--paper); }
.wsv-sugg-count { margin-left: 6px; font-family: var(--font-mono), monospace; font-size: 12px; font-weight: 500; color: var(--warn); border: 1px solid var(--warn-line); border-radius: 6px; padding: 1px 6px; }
.wsv-actions { display: grid; gap: 10px; margin-top: 14px; }
.wsv-confirm { margin-top: 14px; padding: 14px; border-radius: 10px; background: var(--danger-soft); border: 1px solid var(--danger-line); }
.wsv-confirm p { margin: 0 0 12px; font-size: 14px; color: var(--paper); line-height: 1.5; }
`;

/**
 * Display bands for suggestions (docs/08): green = high confidence, amber =
 * check it. Bands only colour the review; nothing is pre-selected either way
 * (a cutoff at 0.8 or above would hide ~10% of Hindi and Kannada identifiers).
 */
const CONFIDENCE_GREEN = 0.9;
const isHigh = (score: number) => score >= CONFIDENCE_GREEN;

function humanEntity(entity: string): string {
  return entity.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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

export function WorkspaceVersionView() {
  const { documentId, versionId } = useParams<{ documentId: string; versionId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.role;
  const canViewSuggestions = can(role, "viewRedactionSuggestions");
  const canConfirm = can(role, "confirmRedactions");
  const canAnchor = can(role, "anchorVersion");
  const canManageShares = can(role, "manageShares");
  const canUpload = can(role, "uploadEvidence");

  const base = `/api/v1/documents/${documentId}/versions/${versionId}`;
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { requestStepUp, stepUpDialog } = useStepUp({ theme: "light" });

  /** Runs the step-up dialog; null means the officer cancelled it. */
  async function stepUpHeaders(actionLabel: string): Promise<Record<string, string> | null> {
    try {
      return { [STEP_UP_HEADER]: await requestStepUp(actionLabel) };
    } catch (err) {
      if (err instanceof StepUpCancelled) return null;
      throw err;
    }
  }

  const load = useCallback(async () => {
    const [v, s] = await Promise.all([
      apiJson<VersionInfo>(base),
      canViewSuggestions ? apiJson<{ suggestions: Suggestion[] }>(`${base}/redaction-suggestions`) : Promise.resolve({ suggestions: [] as Suggestion[] }),
    ]);
    setInfo(v);
    setSuggestions(s.suggestions);
  }, [base, canViewSuggestions]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  // Page images from the existing pages endpoint (authenticated, so fetched as blobs).
  const pageCount = info && info.grid_size > 0 ? Math.round(info.tile_count / (info.grid_size * info.grid_size)) : 0;
  useEffect(() => {
    if (!pageCount) return;
    let cancelled = false;
    const urls: string[] = [];
    const setPage = (i: number, page: PageImage) => {
      if (!cancelled) setPages((prev) => prev.map((p, idx) => (idx === i ? page : p)));
    };
    setPages(Array.from({ length: pageCount }, () => ({ status: "loading" })));
    Array.from({ length: pageCount }).forEach(async (_, i) => {
      try {
        const res = await apiFetch(`${base}/pages/${i}`);
        if (!res.ok) return setPage(i, { status: "missing", httpStatus: res.status });
        const url = URL.createObjectURL(await res.blob());
        urls.push(url);
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = reject;
          img.src = url;
        });
        setPage(i, { status: "ready", url, ...dims });
      } catch {
        setPage(i, { status: "missing", httpStatus: null });
      }
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [base, pageCount]);

  const pending = useMemo(() => suggestions.filter((s) => !s.masked), [suggestions]);
  // OCR flags every tile an identifier touches, so a page can carry dozens; review them by entity type.
  const groups = useMemo(() => {
    const byType = new Map<string, Suggestion[]>();
    for (const sg of pending) byType.set(sg.entity_type, [...(byType.get(sg.entity_type) ?? []), sg]);
    return Array.from(byType, ([entity, items]) => ({ entity, items })).sort((a, b) => b.items.length - a.items.length);
  }, [pending]);
  const maskedCount = suggestions.length - pending.length;
  const reviewable = Boolean(info?.is_current_version) && canConfirm;
  const aState = info ? anchorState(info) : null;
  const anchored = aState === "anchored";

  // Background anchoring after upload/confirm: re-read the version until it settles.
  useEffect(() => {
    if (aState !== "pending" || anchoring) return;
    const timer = setTimeout(() => {
      apiJson<VersionInfo>(base).then(setInfo).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [aState, anchoring, info, base]);

  function toggleGroup(tiles: number[], allSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of tiles) {
        if (allSelected) next.delete(t);
        else next.add(t);
      }
      return next;
    });
  }

  function toggle(tileIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tileIndex)) next.delete(tileIndex);
      else next.add(tileIndex);
      return next;
    });
  }

  async function handleConfirm() {
    setConfirming(true);
    setMessage(null);
    try {
      const headers = await stepUpHeaders("create the redacted version");
      if (!headers) {
        setConfirming(false);
        return;
      }
      const body = await apiJson<{ document_version_id: string }>(`${base}/redactions/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({ confirmed_tile_indices: Array.from(selected) }),
      });
      router.push(`/dashboard/documents/${documentId}/versions/${body.document_version_id}`);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      setConfirming(false);
      setReviewing(false);
    }
  }

  async function handleAnchor() {
    setMessage(null);
    let headers: Record<string, string> | null;
    try {
      headers = await stepUpHeaders("anchor this version to the blockchain");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!headers) return;
    setAnchoring(true);
    try {
      const res = await apiFetch(`${base}/anchor`, { method: "POST", headers });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setMessage({ kind: "ok", text: "Anchored on Polygon Amoy." });
      else setMessage({ kind: "error", text: `Anchoring failed: ${body.reason ?? body.message ?? res.status}` });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setAnchoring(false);
    }
  }

  async function handleBundle() {
    setMessage(null);
    try {
      const proofRes = await apiFetch(`${base}/proof`);
      const proof = await proofRes.json();
      if (!proofRes.ok) throw new Error(proof.message ?? "This version has not completed on-chain anchoring yet.");
      triggerDownload(new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" }), "verification-proof.json");
      for (const p of proof.pages as { page_index: number }[]) {
        const pageRes = await apiFetch(`${base}/pages/${p.page_index}`);
        if (!pageRes.ok) throw new Error(`Could not fetch page ${p.page_index}.`);
        triggerDownload(await pageRes.blob(), `page-${p.page_index}.png`);
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  // Redacted versions only. Downloaded on its own, never alongside the
  // original's verification bundle: that would hand over the masked tiles'
  // original salts (docs/07 Phase 3).
  async function handleRedactionProof() {
    setMessage(null);
    try {
      const res = await apiFetch(`${base}/redaction-proof`);
      const proof = await res.json();
      if (!res.ok) throw new Error(proof.message ?? "The redaction proof is not available yet.");
      triggerDownload(new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" }), "redaction-proof.json");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleCertificate() {
    setMessage(null);
    let headers: Record<string, string> | null;
    try {
      headers = await stepUpHeaders("generate the BSA certificate");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!headers) return;
    const res = await apiFetch(`${base}/certificate`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMessage({ kind: "error", text: body?.message ?? `Could not generate the certificate (${res.status}).` });
      return;
    }
    triggerDownload(await res.blob(), `bsa-certificate-v${info?.version_no}.pdf`);
  }

  return (
    <WorkspaceShell active="cases" extraCss={VERSION_CSS}>
      {info ? (
        <Link href={`/dashboard/cases/${info.case_id}`} className="ws-crumb">
          <Icon name="back" size={18} /> {info.case_number}
        </Link>
      ) : (
        <Link href="/dashboard" className="ws-crumb">
          <Icon name="back" size={18} /> Cases
        </Link>
      )}

      {error && <p className="ws-alert" role="alert">{error}</p>}
      {!info && !error && <p className="ws-empty">Loading…</p>}

      {info && (
        <>
          <div className="ws-title-row">
            <div>
              <h1 className="ws-title">{info.document_title}</h1>
              <div className="ws-meta-line">
                <span className="ws-chip ws-chip-blue">Version {info.version_no}</span>
                {info.is_current_version ? <span className="ws-chip ws-chip-ok">Current version</span> : <span className="ws-chip ws-chip-neutral">Superseded</span>}
                {info.is_redacted && <span className="ws-chip ws-chip-neutral">Redacted</span>}
                <span>Created {formatDateTime(info.created_at)}</span>
                <span aria-hidden="true">·</span>
                <span>{pageCount} page{pageCount === 1 ? "" : "s"}</span>
              </div>
            </div>
            {canUpload && info.is_current_version && (
              <Link href={`/dashboard/cases/${info.case_id}/upload?document=${info.document_id}`} className="ws-secondary">
                <Icon name="upload" size={18} /> Upload new version
              </Link>
            )}
          </div>
          {!info.is_current_version && (
            <p className="ws-note">
              <Icon name="info" size={18} /> A newer version of this document exists. Open the case to see the current version.
            </p>
          )}
          {message && <p className={message.kind === "ok" ? "ws-success" : "ws-alert"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p>}

          <div className="wsv-grid">
            <section className="wsv-viewer" aria-label="Document pages">
              {pages.map((page, i) => (
                <div key={i} style={{ display: "contents" }}>
                  {page.status === "ready" ? (
                    <div className="wsv-page">
                      <img src={page.url} alt={`Page ${i + 1} of ${info.document_title}, version ${info.version_no}`} />
                      {info.is_current_version &&
                        pending
                          .filter((s) => s.page_index === i)
                          .map((s) => {
                            const g = info.grid_size;
                            const tileW = Math.ceil(page.width / g);
                            const tileH = Math.ceil(page.height / g);
                            const style = {
                              left: `${((s.col * tileW) / page.width) * 100}%`,
                              top: `${((s.row * tileH) / page.height) * 100}%`,
                              width: `${(Math.min(tileW, page.width - s.col * tileW) / page.width) * 100}%`,
                              height: `${(Math.min(tileH, page.height - s.row * tileH) / page.height) * 100}%`,
                            };
                            const isSel = selected.has(s.tile_index);
                            const band = isHigh(s.confidence_score) ? "high confidence" : "check";
                            const label = `${humanEntity(s.entity_type)} suggestion, ${band}, row ${s.row + 1}, column ${s.col + 1}${isSel ? ", selected for redaction" : ""}`;
                            const bandClass = isHigh(s.confidence_score) ? " wsv-tile-high" : " wsv-tile-check";
                            return reviewable ? (
                              <button key={s.id} type="button" className={`wsv-tile${bandClass}${isSel ? " wsv-tile-selected" : ""}`} style={style} aria-label={label} aria-pressed={isSel} onClick={() => toggle(s.tile_index)} />
                            ) : (
                              <span key={s.id} className={`wsv-tile wsv-tile-static${bandClass}`} style={style} title={label} />
                            );
                          })}
                    </div>
                  ) : page.status === "missing" ? (
                    <div className="wsv-page-skeleton wsv-page-missing" role="alert">
                      Page {i + 1} image is not available from storage{page.httpStatus ? ` (server returned ${page.httpStatus})` : ""}.
                    </div>
                  ) : (
                    <div className="wsv-page-skeleton">Loading page {i + 1}…</div>
                  )}
                  <div className="wsv-page-label">Page {i + 1} of {pageCount}</div>
                </div>
              ))}
            </section>

            <div className="wsv-side">
              <section className="ws-panel ws-panel-pad" aria-labelledby="wsv-integrity">
                <h2 id="wsv-integrity" className="ws-panel-title">Integrity</h2>
                <div style={{ marginTop: 8 }}>
                  <div className="wsv-status">
                    <span className="wsv-status-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><Icon name="fingerprint" size={20} /></span>
                    <div>
                      <div className="wsv-status-title">Fingerprint recorded</div>
                      <div className="wsv-status-text">The server computed this version&apos;s fingerprint from its page images when the version was created.</div>
                    </div>
                  </div>
                  <div className="wsv-status">
                    <span
                      className="wsv-status-icon"
                      style={
                        anchored ? { background: "var(--ok-soft)", color: "var(--ok)" }
                        : aState === "failed" || aState === "stalled" ? { background: "var(--danger-soft)", color: "var(--danger)" }
                        : aState === "pending" ? { background: "var(--brand-soft)", color: "var(--brand)" }
                        : { background: "var(--ink-4)", color: "var(--paper-3)" }
                      }
                    >
                      <Icon name="anchor" size={20} />
                    </span>
                    <div>
                      <div className="wsv-status-title">
                        {anchored ? "Anchored on Polygon Amoy" : aState === "pending" || anchoring ? "Anchoring in progress" : aState === "failed" ? "Anchoring failed" : info.anchor ? "Anchoring did not complete" : "Not anchored"}
                      </div>
                      <div className="wsv-status-text">
                        {anchored && info.anchor ? (
                          <>
                            {formatDateTime(info.anchor.anchored_at)} ·{" "}
                            <a href={`https://amoy.polygonscan.com/tx/${info.anchor.polygon_tx_hash}`} target="_blank" rel="noreferrer" style={{ color: "var(--paper)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                              View transaction
                            </a>
                          </>
                        ) : aState === "pending" || anchoring ? (
                          info.anchor?.object_lock_uri ? "Fingerprint saved to storage; waiting for the Polygon transaction." : "Writing the fingerprint to storage, then to Polygon."
                        ) : info.anchor?.error_message ? (
                          <span className="ws-mono" style={{ overflowWrap: "anywhere" }}>{info.anchor.error_message.slice(0, 240)}</span>
                        ) : (
                          "This version's fingerprint has not been recorded on the blockchain."
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {canAnchor && !anchored && !anchoring && aState !== "pending" && (
                  <button type="button" className="ws-primary" style={{ width: "100%", marginTop: 8 }} onClick={handleAnchor}>
                    {info.anchor ? "Retry anchoring" : "Anchor now"}
                  </button>
                )}
                <details className="wsv-details">
                  <summary>View technical details</summary>
                  {info.proof_version === 1 ? (
                    <div className="wsv-hash"><span className="wsv-hash-label">Merkle root (legacy v1, unsalted)</span><span className="wsv-hash-value">{info.merkle_root}</span></div>
                  ) : (
                    <>
                      <div className="wsv-hash"><span className="wsv-hash-label">Anchored commitment</span><span className="wsv-hash-value">{info.commitment}</span></div>
                      <div className="wsv-hash"><span className="wsv-hash-label">Document root (salted tiles)</span><span className="wsv-hash-value">{info.merkle_root}</span></div>
                    </>
                  )}
                  <div className="wsv-hash"><span className="wsv-hash-label">Client hash (page images)</span><span className="wsv-hash-value">{info.client_hash}</span></div>
                  <div className="wsv-hash"><span className="wsv-hash-label">Chain hash</span><span className="wsv-hash-value">{info.chain_hash}</span></div>
                  <div className="wsv-hash"><span className="wsv-hash-label">Previous version&apos;s chain hash</span><span className="wsv-hash-value">{info.previous_hash ?? "None (first version)"}</span></div>
                  <div className="wsv-hash"><span className="wsv-hash-label">Tile grid</span><span className="wsv-hash-value">{info.grid_size} × {info.grid_size} per page</span></div>
                  {info.anchor?.polygon_tx_hash && (
                    <div className="wsv-hash"><span className="wsv-hash-label">Polygon transaction</span><span className="wsv-hash-value">{info.anchor.polygon_tx_hash}</span></div>
                  )}
                </details>
              </section>

              {canViewSuggestions && info.is_current_version && (
                <section className="ws-panel ws-panel-pad" aria-labelledby="wsv-review">
                  <h2 id="wsv-review" className="ws-panel-title">Redaction review</h2>
                  <p className="ws-panel-sub">
                    Suggestions stored for this document, grouped by type. Select a group, or click individual areas on the page, and check them against the page before confirming.
                  </p>
                  {maskedCount > 0 && (
                    <p className="ws-row-note" style={{ marginTop: 10 }}>
                      {maskedCount} area{maskedCount === 1 ? " is" : "s are"} already masked in this version.
                    </p>
                  )}
                  {pending.length === 0 ? (
                    <p className="ws-empty" style={{ paddingBottom: 4 }}>No suggestions to review for this version.</p>
                  ) : (
                    <ul className="wsv-sugg-list">
                      {groups.map((g) => {
                        const tiles = g.items.map((x) => x.tile_index);
                        const chosen = tiles.filter((t) => selected.has(t)).length;
                        const pages = Array.from(new Set(g.items.map((x) => x.page_index + 1))).sort((a, b) => a - b);
                        const scores = g.items.map((x) => Math.round(x.confidence_score * 100));
                        const lo = Math.min(...scores);
                        const hi = Math.max(...scores);
                        const sources = Array.from(new Set(g.items.map((x) => x.source)));
                        const high = g.items.filter((x) => isHigh(x.confidence_score)).length;
                        const id = `sugg-${g.entity}`;
                        return (
                          <li key={g.entity} className="wsv-sugg">
                            <input
                              id={id}
                              type="checkbox"
                              checked={chosen === tiles.length}
                              ref={(el) => {
                                if (el) el.indeterminate = chosen > 0 && chosen < tiles.length;
                              }}
                              onChange={() => toggleGroup(tiles, chosen === tiles.length)}
                              disabled={!reviewable || confirming}
                            />
                            <label htmlFor={id}>
                              <span className="wsv-sugg-type">
                                {humanEntity(g.entity)} <span className="wsv-sugg-count">{g.items.length} area{g.items.length === 1 ? "" : "s"}</span>
                              </span>
                              <span>
                                Page{pages.length === 1 ? "" : "s"} {pages.join(", ")} · confidence {lo === hi ? `${lo}%` : `${lo}–${hi}%`}
                              </span>
                              <span className="wsv-bands">
                                {high > 0 && <span className="ws-chip ws-chip-ok">{high} high confidence</span>}
                                {g.items.length - high > 0 && <span className="ws-chip ws-chip-warn">{g.items.length - high} check</span>}
                              </span>
                              <span>
                                Source <span className="ws-mono">{sources.join(", ")}</span>
                                {chosen > 0 && chosen < tiles.length && ` · ${chosen} of ${tiles.length} selected`}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {reviewable && pending.length > 0 && !reviewing && (
                    <div className="wsv-actions">
                      <button type="button" className="ws-primary" disabled={selected.size === 0} onClick={() => setReviewing(true)}>
                        Review {selected.size} selected area{selected.size === 1 ? "" : "s"}
                      </button>
                    </div>
                  )}
                  {reviewing && (
                    <div className="wsv-confirm">
                      <p>
                        This creates version {info.version_no + 1} with {selected.size} area{selected.size === 1 ? "" : "s"} blacked out, and the server computes its new fingerprint. The blacked-out areas cannot be restored in the new version; this version is kept unchanged.
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" className="ws-danger" onClick={handleConfirm} disabled={confirming}>
                          {confirming ? "Creating…" : "Create redacted version"}
                        </button>
                        <button type="button" className="ws-secondary" onClick={() => setReviewing(false)} disabled={confirming}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="ws-panel ws-panel-pad" aria-labelledby="wsv-downloads">
                <h2 id="wsv-downloads" className="ws-panel-title">Downloads</h2>
                <div className="wsv-actions">
                  <button type="button" className="ws-secondary" onClick={handleCertificate}>
                    <Icon name="download" size={18} /> Download certificate
                  </button>
                  <p className="ws-row-note" style={{ margin: "-4px 0 4px" }}>
                    BSA s.63 certificate, pre-filled with this version&apos;s record. Unsigned until the officer and the expert sign it.
                    {info.public_verify_url ? (
                      <>
                        {" "}Its QR code opens{" "}
                        <a href={info.public_verify_url} target="_blank" rel="noreferrer" data-testid="certificate-verify-link" style={{ color: "var(--paper)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                          this verification link
                        </a>
                        . {CERTIFICATE_QR_STATEMENT}
                      </>
                    ) : (
                      " It gets a verification QR code once the version is anchored."
                    )}
                  </p>
                  {anchored ? (
                    <>
                      <button type="button" className="ws-secondary" onClick={handleBundle}>
                        <Icon name="download" size={18} /> Download verification bundle
                      </button>
                      <p className="ws-row-note" style={{ margin: "-4px 0 0" }}>
                        The proof file and page images. Anyone can check them at <Link href="/verify" style={{ color: "var(--paper)", textDecoration: "underline", textUnderlineOffset: 3 }}>/verify</Link> without an account.
                      </p>
                      {info.is_redacted && (
                        <>
                          <button type="button" className="ws-secondary" onClick={handleRedactionProof}>
                            <Icon name="download" size={18} /> Download redaction proof
                          </button>
                          <p className="ws-row-note" style={{ margin: "-4px 0 0" }}>
                            With these page images, shows the copy is the original anchored document except for the masked areas. Both versions must be anchored.
                          </p>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="ws-row-note" style={{ margin: 0 }}>The verification bundle is available once this version is anchored.</p>
                  )}
                </div>
              </section>

              {canManageShares && <WorkspaceSharePanel documentId={documentId} />}
            </div>
          </div>
        </>
      )}
      {stepUpDialog}
    </WorkspaceShell>
  );
}
