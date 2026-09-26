import { resolveShareView } from "@/lib/shares-repo";
import { ShieldIcon } from "@/lib/client/shield-icon";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function shortHash(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Link not found",
  REVOKED: "This link has been revoked",
  EXPIRED: "This link has expired",
  EXHAUSTED: "This link has reached its view limit",
};

function ErrorScreen({ message }: { message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: "#0a0f1a", color: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 18px" }} aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.8" />
          <path d="m8 8 8 8M16 8l-8 8" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <h1 style={{ margin: 0, fontSize: 20, color: "#fecaca" }}>{message}</h1>
      </div>
    </main>
  );
}

export default async function SharedDocumentPage({ params }: { params: { token: string } }) {
  const result = await resolveShareView(params.token);

  if (result.status !== "OK") {
    return <ErrorScreen message={ERROR_MESSAGES[result.status]} />;
  }

  const { document, recipientLabel, expiresAt, viewsRemaining } = result;
  const version = document.latestAnchoredVersion;
  const anchored = Boolean(version?.polygonTxHash);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0f1a", color: "#f9fafb", padding: "40px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", width: "100%", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <ShieldIcon size={30} />
          <span style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", letterSpacing: -0.3 }}>DigiVault</span>
        </div>

        <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 6, fontSize: 13, color: "#93c5fd", marginBottom: 20 }}>
          This link expires on {formatDate(expiresAt)} · {viewsRemaining} view{viewsRemaining === 1 ? "" : "s"} remaining
        </div>

        <section style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: 22 }}>
          <p style={{ margin: "0 0 8px", color: "#60a5fa", fontSize: 12, fontWeight: 700 }}>{document.caseNumber}</p>
          <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}>{document.title}</h1>
          <p style={{ margin: "8px 0 0", color: "#9ca3af", fontSize: 13 }}>
            {document.docType} · Shared with {recipientLabel}
          </p>

          <div style={{ marginTop: 20 }}>
            {anchored ? (
              <span style={{ display: "inline-flex", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981", background: "rgba(16,185,129,0.10)", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>
                ✓ Anchored to Polygon
              </span>
            ) : (
              <span style={{ display: "inline-flex", border: "1px solid rgba(245,158,11,0.45)", color: "#f59e0b", background: "rgba(245,158,11,0.10)", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>
                Not yet anchored
              </span>
            )}
          </div>

          {version && (
            <div style={{ marginTop: 16, display: "grid", gap: 8, fontSize: 13 }}>
              <div>
                merkle_root: <code title={version.merkleRoot} style={{ color: "#60a5fa", fontFamily: "monospace" }}>{shortHash(version.merkleRoot)}</code>
              </div>
              {version.polygonTxHash && (
                <div>
                  polygon_tx_hash:{" "}
                  <a href={`https://amoy.polygonscan.com/tx/${version.polygonTxHash}`} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontFamily: "monospace" }}>
                    {shortHash(version.polygonTxHash)}
                  </a>
                </div>
              )}
              <div>
                timestamp: <code style={{ color: "#9ca3af", fontFamily: "monospace" }}>{version.timestamp.toISOString()}</code>
              </div>
            </div>
          )}
        </section>

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {version ? (
            <a
              href={`/api/v1/shares/${params.token}/download`}
              style={{ display: "block", textAlign: "center", background: "#3b82f6", color: "#f9fafb", border: "1px solid #3b82f6", borderRadius: 6, padding: "12px 14px", fontWeight: 800, textDecoration: "none" }}
            >
              Download redacted document
            </a>
          ) : (
            <span style={{ display: "block", textAlign: "center", background: "#1f2937", color: "#9ca3af", borderRadius: 6, padding: "12px 14px", fontWeight: 800 }}>
              Download redacted document
            </span>
          )}
          <span
            title="Verification bundles require an authenticated DigiVault session"
            style={{ display: "block", textAlign: "center", background: "#1f2937", color: "#9ca3af", borderRadius: 6, padding: "12px 14px", fontWeight: 800, cursor: "not-allowed" }}
          >
            Download verification bundle (coming soon)
          </span>
        </section>
      </div>

      <footer style={{ maxWidth: 640, margin: "40px auto 0", textAlign: "center", color: "#4b5563", fontSize: 12 }}>
        Powered by DigiVault · Secured by Polygon Amoy · This is an official evidentiary document link
      </footer>
    </main>
  );
}
