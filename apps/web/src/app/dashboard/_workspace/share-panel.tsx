"use client";

/**
 * Share links, workspace design. Existing endpoints only:
 *   GET    /api/v1/documents/{documentId}/shares
 *   POST   /api/v1/documents/{documentId}/shares   { recipientLabel, expiresAt, maxViews }
 *   DELETE /api/v1/documents/{documentId}/shares/{shareId}
 * Render only for roles `can(role, "manageShares")` allows. The backend only
 * shares a redacted version (POST returns 403 NO_REDACTED_VERSION otherwise)
 * and reports which one as `sharedVersion`, so creation is offered only then.
 */

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/client/api-client";
import { formatDate } from "./shell";

interface ShareRow {
  id: string;
  token: string;
  recipientLabel: string;
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  revokedAt: string | null;
  createdAt: string;
}

/** YYYY-MM-DD in local time, `daysAhead` days from today (the value format of a date input). */
function localDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mirrors the checks the share endpoints apply (revoked, expired, view limit reached). */
function shareState(s: ShareRow): { label: string; cls: string; usable: boolean } {
  if (s.revokedAt) return { label: "Revoked", cls: "ws-chip-neutral", usable: false };
  if (new Date(s.expiresAt) < new Date()) return { label: "Expired", cls: "ws-chip-warn", usable: false };
  if (s.viewCount >= s.maxViews) return { label: "View limit reached", cls: "ws-chip-warn", usable: false };
  return { label: "Active", cls: "ws-chip-ok", usable: true };
}

export function WorkspaceSharePanel({ documentId }: { documentId: string }) {
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState(localDate(1));
  const [maxViews, setMaxViews] = useState(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [sharedVersion, setSharedVersion] = useState<{ id: string; versionNo: number } | null | undefined>(undefined);
  const [listError, setListError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyShareLink(s: ShareRow) {
    await navigator.clipboard.writeText(`${window.location.origin}/shares/${s.token}`);
    setCopiedId(s.id);
  }

  const loadShares = useCallback(async () => {
    try {
      const body = await apiJson<{ shares: ShareRow[]; sharedVersion: { id: string; versionNo: number } | null }>(
        `/api/v1/documents/${documentId}/shares`
      );
      setShares(body.shares);
      setSharedVersion(body.sharedVersion);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    }
  }, [documentId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCopied(false);
    try {
      const body = await apiJson<{ shareUrl: string }>(`/api/v1/documents/${documentId}/shares`, {
        method: "POST",
        // The link stays valid until the end of the chosen day, local time.
        body: JSON.stringify({ recipientLabel, expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(), maxViews }),
      });
      setGeneratedUrl(`${window.location.origin}${body.shareUrl}`);
      setRecipientLabel("");
      setExpiresAt(localDate(1));
      setMaxViews(3);
      await loadShares();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(shareId: string) {
    setRevokingId(shareId);
    setListError(null);
    try {
      await apiJson(`/api/v1/documents/${documentId}/shares/${shareId}`, { method: "DELETE" });
      await loadShares();
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="ws-panel ws-panel-pad" aria-labelledby="wsv-share">
      <h2 id="wsv-share" className="ws-panel-title">Share</h2>
      <p className="ws-panel-sub">A time- and view-limited link for one recipient. Links only ever serve a redacted version, never the original upload.</p>

      {sharedVersion === null && (
        <p className="ws-note">
          Confirm redactions first. Share links become available once a redacted version of this document exists.
        </p>
      )}
      {sharedVersion && (
        <p className="ws-row-note" style={{ marginTop: 10 }}>
          Recipients will receive the redacted <strong>version {sharedVersion.versionNo}</strong>.
        </p>
      )}

      {sharedVersion && (
      <form onSubmit={handleCreate} style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <label className="ws-field">
          Recipient
          <input id="share-recipient" className="ws-input" required placeholder="e.g. Sessions Court, Room 7" value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
          <label className="ws-field">
            Expires
            <input className="ws-input" type="date" required min={localDate(0)} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label className="ws-field">
            Max views
            <input className="ws-input" type="number" min={1} max={10} required value={maxViews} onChange={(e) => setMaxViews(Number(e.target.value))} />
          </label>
        </div>
        <button type="submit" className="ws-primary" disabled={creating}>
          {creating ? "Generating link…" : "Generate share link"}
        </button>
      </form>
      )}
      {createError && <p className="ws-alert" role="alert">{createError}</p>}

      {generatedUrl && (
        <div className="ws-success" style={{ display: "grid", gap: 8 }}>
          <span>Link generated. Copy it and send it to the recipient.</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code className="ws-mono" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{generatedUrl}</code>
            <button
              type="button"
              className="ws-secondary"
              style={{ height: 34 }}
              onClick={async () => {
                await navigator.clipboard.writeText(generatedUrl);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <h3 style={{ margin: "22px 0 4px", fontSize: 14.5, fontWeight: 600 }}>Links for this document</h3>
      {listError && <p className="ws-alert" role="alert">{listError}</p>}
      {shares === null && !listError && <p className="ws-row-note">Loading…</p>}
      {shares !== null && shares.length === 0 && <p className="ws-row-note">No share links yet.</p>}
      {shares !== null && shares.length > 0 && (
        <ul className="ws-list">
          {shares.map((s) => {
            const state = shareState(s);
            return (
              <li key={s.id} className="ws-row" style={{ alignItems: "flex-start" }}>
                <span className="ws-row-main">
                  <div className="ws-row-title">{s.recipientLabel}</div>
                  <div className="ws-row-note" style={{ marginTop: 2 }}>
                    Expires {formatDate(s.expiresAt)} · {s.viewCount}/{s.maxViews} views
                  </div>
                </span>
                <span style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                  <span className={`ws-chip ${state.cls}`}>{state.label}</span>
                  {state.usable && (
                    <button type="button" className="ws-more" onClick={() => copyShareLink(s)}>
                      {copiedId === s.id ? "Copied" : "Copy link"}
                    </button>
                  )}
                  {!s.revokedAt && (
                    <button type="button" className="ws-more" style={{ color: "#CC1016" }} disabled={revokingId === s.id} onClick={() => handleRevoke(s.id)}>
                      {revokingId === s.id ? "Revoking…" : "Revoke"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
