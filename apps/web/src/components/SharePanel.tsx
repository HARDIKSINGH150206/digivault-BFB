"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/client/api-client";

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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function tomorrowDateInputValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function shareStatus(share: ShareRow): { label: string; color: string; background: string; border: string } {
  if (share.revokedAt) return { label: "Revoked", color: "#9ca3af", background: "rgba(156,163,175,0.10)", border: "rgba(156,163,175,0.35)" };
  if (new Date(share.expiresAt) < new Date()) return { label: "Expired", color: "#f59e0b", background: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.40)" };
  return { label: "Active", color: "#10b981", background: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.40)" };
}

export function SharePanel({ documentId }: { documentId: string; versionId: string }) {
  const [recipientLabel, setRecipientLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState(tomorrowDateInputValue());
  const [maxViews, setMaxViews] = useState(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    try {
      const body = await apiJson<{ shares: ShareRow[] }>(`/api/v1/documents/${documentId}/shares`);
      setShares(body.shares);
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
        body: JSON.stringify({
          recipientLabel,
          expiresAt: new Date(expiresAt).toISOString(),
          maxViews,
        }),
      });
      setGeneratedUrl(`${window.location.origin}${body.shareUrl}`);
      setRecipientLabel("");
      setExpiresAt(tomorrowDateInputValue());
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

  const inputStyle: React.CSSProperties = {
    background: "#0a0f1a",
    color: "#f9fafb",
    border: "1px solid #1f2937",
    borderRadius: 6,
    padding: "9px 10px",
    fontSize: 13,
    width: "100%",
  };
  const labelStyle: React.CSSProperties = { display: "block", color: "#9ca3af", fontSize: 12, marginBottom: 6 };

  return (
    <section style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 22 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>Consent-based sharing</h2>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
        Generate a time-limited, view-limited link for a specific recipient (e.g. a court or opposing counsel).
      </p>

      <form onSubmit={handleCreate} style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "end" }}>
        <div>
          <label style={labelStyle} htmlFor="share-recipient">Recipient label</label>
          <input
            id="share-recipient"
            style={inputStyle}
            type="text"
            placeholder="e.g. Delhi High Court — Room 7"
            value={recipientLabel}
            onChange={(e) => setRecipientLabel(e.target.value)}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="share-expires">Expires at</label>
          <input
            id="share-expires"
            style={inputStyle}
            type="date"
            min={tomorrowDateInputValue()}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="share-max-views">Max views</label>
          <input
            id="share-max-views"
            style={inputStyle}
            type="number"
            min={1}
            max={10}
            value={maxViews}
            onChange={(e) => setMaxViews(Number(e.target.value))}
            required
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          style={{
            background: creating ? "#1f2937" : "#3b82f6",
            color: "#f9fafb",
            border: `1px solid ${creating ? "#1f2937" : "#3b82f6"}`,
            borderRadius: 6,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: creating ? "not-allowed" : "pointer",
            height: 38,
          }}
        >
          {creating ? "Generating..." : "Generate share link"}
        </button>
      </form>

      {createError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{createError}</p>}

      {generatedUrl && (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 12px", background: "#0a0f1a", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 6 }}>
          <code style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#60a5fa", fontFamily: "monospace", fontSize: 13 }}>
            {generatedUrl}
          </code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(generatedUrl);
              setCopied(true);
            }}
            style={{ background: "#0a0f1a", color: "#f9fafb", border: "1px solid #1f2937", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <h3 style={{ margin: "24px 0 0", fontSize: 14, color: "#9ca3af" }}>Active share links</h3>

      {listError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{listError}</p>}

      {shares === null && !listError && (
        <p className="skeleton-pulse" style={{ marginTop: 12, color: "#9ca3af", fontSize: 13 }}>Loading...</p>
      )}

      {shares !== null && shares.length === 0 && (
        <p style={{ marginTop: 12, color: "#9ca3af", fontSize: 13 }}>No share links created yet</p>
      )}

      {shares !== null && shares.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
          {shares.map((share) => {
            const status = shareStatus(share);
            return (
              <li
                key={share.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1fr) 110px 90px 90px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  background: "#0a0f1a",
                }}
              >
                <span style={{ color: "#f9fafb", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {share.recipientLabel}
                </span>
                <span style={{ color: "#9ca3af", fontSize: 12 }}>{formatDate(share.expiresAt)}</span>
                <span style={{ color: "#9ca3af", fontSize: 12 }}>{share.viewCount}/{share.maxViews} views</span>
                <span style={{ justifySelf: "start", border: `1px solid ${status.border}`, color: status.color, background: status.background, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>
                  {status.label}
                </span>
                {status.label === "Active" ? (
                  <button
                    onClick={() => handleRevoke(share.id)}
                    disabled={revokingId === share.id}
                    style={{
                      justifySelf: "end",
                      background: "transparent",
                      color: "#ef4444",
                      border: "1px solid rgba(239,68,68,0.45)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: 12,
                      cursor: revokingId === share.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {revokingId === share.id ? "Revoking..." : "Revoke"}
                  </button>
                ) : (
                  <span />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
