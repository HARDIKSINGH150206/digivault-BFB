"use client";

/**
 * Audit log integrity (ADMIN; docs/07 Phase 4).
 *   GET  /api/v1/admin/audit         -> chain check + head anchored on EvidenceAnchorV2
 *   POST /api/v1/admin/audit/anchor  -> anchor the head now (step-up; spends gas)
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/client/auth-context";
import { apiFetch, apiJson } from "@/lib/client/api-client";
import { useStepUp, StepUpCancelled, STEP_UP_HEADER } from "@/lib/client/use-step-up";
import { WorkspaceShell, formatDateTime } from "./shell";

interface AuditStatusResponse {
  chain: { ok: true; checked: number; head_seq: number | null; head_hash: string | null } | { ok: false; checked: number; bad_seq: number; reason: string };
  anchored: { seq: number; head: string; anchored_at: string | null; tx_hash: string | null; block_number: number | null } | null;
  anchored_matches: boolean | null;
  unanchored_entries: number | null;
  rewritten_range: { from: number; to: number } | null;
  chain_read_error: string | null;
  interval_hours: number;
  recent_attempts: { seq: number; status: string; created_at: string; tx_hash: string | null; block_number: number | null; error_message: string | null }[];
}

/* Same rule as the other pages: no quote, ampersand or angle-bracket characters inside this CSS. */
const AUDIT_CSS = `
.au-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 24px; align-items: start; }
@media (max-width: 1000px) { .au-grid { grid-template-columns: minmax(0, 1fr); } }
.au-verdict { margin-top: 24px; padding: 18px 20px; border-radius: 12px; border: 1px solid var(--line-2); }
.au-verdict-ok { border-color: var(--ok); }
.au-verdict-bad { border-color: var(--danger-line); background: var(--danger-soft); }
.au-verdict-title { margin: 0; font-size: 18px; font-weight: 500; letter-spacing: -0.01em; }
.au-verdict-text { margin: 6px 0 0; font-size: 14px; color: var(--paper-3); line-height: 1.5; }
.au-code { font-family: var(--font-mono), ui-monospace, monospace; font-size: 12.5px; }
.au-msg { margin: 12px 0 0; font-size: 13.5px; color: var(--paper-2); }
.au-msg-error { color: var(--danger); }
.ws-main a.au-link { color: var(--paper); text-decoration: underline; text-underline-offset: 3px; }
`;

function short(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a className="au-link au-code" href={`https://amoy.polygonscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
      {short(hash)}
    </a>
  );
}

function Verdict({ s }: { s: AuditStatusResponse }) {
  if (!s.chain.ok) {
    return (
      <div className="au-verdict au-verdict-bad" role="alert" data-testid="audit-verdict">
        <p className="au-verdict-title">Audit log tampered with at entry #{s.chain.bad_seq}</p>
        <p className="au-verdict-text">
          {s.chain.reason}. Entries #1–{s.chain.checked} verify.
        </p>
      </div>
    );
  }
  if (s.anchored && s.anchored_matches === false) {
    return (
      <div className="au-verdict au-verdict-bad" role="alert" data-testid="audit-verdict">
        <p className="au-verdict-title">Audit log rewritten: entry #{s.anchored.seq} does not match its blockchain anchor</p>
        <p className="au-verdict-text">
          The chain in the database is consistent, but entry #{s.anchored.seq} differs from the head anchored on Polygon: entries were rewritten and their hashes
          recomputed.
          {s.rewritten_range &&
            ` The first rewritten entry is between #${s.rewritten_range.from} and #${s.rewritten_range.to}${s.rewritten_range.from > 1 ? `; entries #1–${s.rewritten_range.from - 1} match their anchors` : ""}.`}
        </p>
      </div>
    );
  }
  if (s.anchored) {
    return (
      <div className="au-verdict au-verdict-ok" data-testid="audit-verdict">
        <p className="au-verdict-title">
          Audit log verified up to entry #{s.anchored.seq}
          {s.anchored.block_number !== null ? `, anchored in block ${s.anchored.block_number}` : ", anchored on Polygon Amoy"}
        </p>
        <p className="au-verdict-text">
          {s.chain.checked} entries verify end to end.
          {s.unanchored_entries ? ` ${s.unanchored_entries} newer entr${s.unanchored_entries === 1 ? "y is" : "ies are"} hash-chained but not anchored yet.` : " Every entry is covered by the anchor."}
        </p>
      </div>
    );
  }
  return (
    <div className="au-verdict" data-testid="audit-verdict">
      <p className="au-verdict-title">Audit log verified ({s.chain.checked} entries), not anchored yet</p>
      <p className="au-verdict-text">
        {s.chain_read_error ? `Could not read the blockchain: ${s.chain_read_error}` : "No audit head has been anchored on Polygon yet."}
      </p>
    </div>
  );
}

export function WorkspaceAuditView() {
  const { session } = useAuth();
  const [status, setStatus] = useState<AuditStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const { requestStepUp, stepUpDialog } = useStepUp({ theme: "light" });

  const load = useCallback(async () => {
    try {
      setStatus(await apiJson<AuditStatusResponse>("/api/v1/admin/audit"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAnchor() {
    setMessage(null);
    let token: string;
    try {
      token = await requestStepUp("anchor the audit log on the blockchain");
    } catch (err) {
      if (!(err instanceof StepUpCancelled)) setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      return;
    }
    setAnchoring(true);
    try {
      const res = await apiFetch("/api/v1/admin/audit/anchor", { method: "POST", headers: { [STEP_UP_HEADER]: token } });
      const body = await res.json().catch(() => ({}));
      if (body.status === "ANCHORED") setMessage({ kind: "ok", text: `Anchored entry #${body.seq} in block ${body.block_number}.` });
      else if (body.status === "SKIPPED") setMessage({ kind: "ok", text: body.reason });
      else setMessage({ kind: "error", text: `Anchoring failed: ${body.reason ?? body.message ?? res.status}` });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setAnchoring(false);
    }
  }

  return (
    <WorkspaceShell active="audit" extraCss={AUDIT_CSS}>
      <div className="ws-title-row">
        <div>
          <h1 className="ws-title">Audit log</h1>
          <p className="ws-subtitle">Hash-chained record of every action, anchored on Polygon Amoy</p>
        </div>
      </div>

      {session?.role !== "ADMIN" ? (
        <p className="au-msg au-msg-error">Only administrators can view audit log integrity.</p>
      ) : error ? (
        <p className="au-msg au-msg-error" role="alert">{error}</p>
      ) : !status ? (
        <p className="au-msg">Verifying the audit log…</p>
      ) : (
        <>
          <Verdict s={status} />
          <div className="au-grid">
            <section className="ws-panel ws-panel-pad" aria-labelledby="au-anchor">
              <h2 id="au-anchor" className="ws-panel-title">Latest anchored head</h2>
              {status.anchored ? (
                <dl className="ws-dl">
                  <dt>Entry</dt>
                  <dd>#{status.anchored.seq}</dd>
                  <dt>Entry hash</dt>
                  <dd className="au-code" title={status.anchored.head}>{short(status.anchored.head)}</dd>
                  {status.anchored.anchored_at && (
                    <>
                      <dt>Anchored</dt>
                      <dd>{formatDateTime(status.anchored.anchored_at)}</dd>
                    </>
                  )}
                  {status.anchored.block_number !== null && (
                    <>
                      <dt>Block</dt>
                      <dd>{status.anchored.block_number}</dd>
                    </>
                  )}
                  {status.anchored.tx_hash && (
                    <>
                      <dt>Transaction</dt>
                      <dd><TxLink hash={status.anchored.tx_hash} /></dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="ws-row-note">Nothing anchored yet.</p>
              )}
              <p className="ws-row-note" style={{ margin: "0 0 12px" }}>
                {status.interval_hours > 0
                  ? `The head is anchored every ${status.interval_hours} h when there are new entries, and with every document anchor.`
                  : "Scheduled anchoring is off (AUDIT_ANCHOR_INTERVAL_HOURS=0); heads are still anchored with every document anchor."}{" "}
                Entries after the last anchored head could be rewritten by someone with database-owner access until the next anchor.
              </p>
              <button type="button" className="ws-secondary" onClick={handleAnchor} disabled={anchoring || !status.chain.ok || status.anchored_matches === false}>
                {anchoring ? "Anchoring…" : "Anchor audit head now"}
              </button>
              {message && <p className={message.kind === "ok" ? "au-msg" : "au-msg au-msg-error"} role="status">{message.text}</p>}
            </section>

            <section className="ws-panel ws-panel-pad" aria-labelledby="au-attempts">
              <h2 id="au-attempts" className="ws-panel-title">Scheduled and manual anchors</h2>
              {status.recent_attempts.length === 0 ? (
                <p className="ws-row-note">None yet. Heads carried by document anchors are not listed here.</p>
              ) : (
                <div className="ws-table-wrap">
                  <table className="ws-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Status</th>
                        <th>When</th>
                        <th>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.recent_attempts.map((a, i) => (
                        <tr key={i}>
                          <td>#{a.seq}</td>
                          <td>
                            <span className={`ws-chip ${a.status === "ANCHORED" ? "ws-chip-ok" : a.status === "FAILED" ? "ws-chip-warn" : "ws-chip-neutral"}`} title={a.error_message ?? undefined}>
                              {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                            </span>
                          </td>
                          <td>{formatDateTime(a.created_at)}</td>
                          <td>{a.tx_hash ? <TxLink hash={a.tx_hash} /> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {stepUpDialog}
    </WorkspaceShell>
  );
}
