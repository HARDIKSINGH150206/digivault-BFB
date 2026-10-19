"use client";

import { useState } from "react";

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

/**
 * Downloads what /verify needs to check this shared copy against the
 * original's public record (docs/03 §Redaction proofs): redaction-proof.json
 * and the lossless page PNGs. The PDF can't be verified — it re-encodes the
 * pages.
 */
export function ShareVerifyDownloads({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleDownload() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/shares/${token}/redaction-proof`);
      const proof = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(proof.message ?? "The verification files are not available yet.");
      triggerDownload(new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" }), "redaction-proof.json");
      const pages = proof.pages as { page: number }[];
      for (const p of pages) {
        const pageRes = await fetch(`/api/v1/shares/${token}/pages/${p.page}`);
        if (!pageRes.ok) throw new Error(`Could not download page ${p.page + 1}.`);
        triggerDownload(await pageRes.blob(), `page-${p.page}.png`);
      }
      setMessage({
        kind: "ok",
        text: `Downloaded redaction-proof.json and ${pages.length} page image${pages.length === 1 ? "" : "s"}. Open the verification page and add them.`,
      });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="sh-secondary" onClick={handleDownload} disabled={busy}>
        {busy ? "Preparing verification files…" : "Download verification files"}
      </button>
      {message && (
        <p className={message.kind === "ok" ? "sh-msg" : "sh-msg sh-msg-error"} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </>
  );
}
