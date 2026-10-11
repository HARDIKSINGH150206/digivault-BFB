import { headers } from "next/headers";
import Link from "next/link";
import { resolveShareView } from "@/lib/shares-repo";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark } from "../../dashboard/_workspace/shell";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function shortHash(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

const ERROR_MESSAGES: Record<string, { title: string; detail: string }> = {
  NOT_FOUND: { title: "Link not found", detail: "Check that the full link was copied." },
  REVOKED: { title: "This link has been revoked", detail: "Ask the officer who shared it for a new link." },
  EXPIRED: { title: "This link has expired", detail: "Ask the officer who shared it for a new link." },
  EXHAUSTED: { title: "This link has reached its view limit", detail: "Ask the officer who shared it for a new link." },
};

/* Same rule as the other pages: no quote, ampersand or angle-bracket characters inside this CSS. */
const SHARE_CSS = `
.sh { min-height: 100vh; display: flex; flex-direction: column; background: var(--ink); color: var(--paper); }
.sh *, .sh *::before, .sh *::after { box-sizing: border-box; }
.sh-header { height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: rgba(10,10,10,0.8); border-bottom: 1px solid var(--line); }
.sh-brand { font-family: var(--font-display); font-weight: 500; font-size: 19px; letter-spacing: -0.3px; line-height: 1.1; }
.sh-brand-sub { font-size: 12.5px; color: var(--paper-3); }
.sh-main { flex: 1; width: 100%; max-width: 680px; margin: 0 auto; padding: 36px 16px 48px; }
.sh-notice { margin: 0 0 16px; padding: 11px 14px; border-radius: 10px; background: var(--ink-2); border: 1px solid var(--line-2); font-size: 14px; }
.sh-card { background: var(--ink-2); border: 0; border-radius: 20px; padding: 24px; box-shadow: var(--shadow-card); }
.sh-case { margin: 0 0 6px; font-size: 13.5px; font-weight: 500; color: var(--brand); }
.sh-title { margin: 0; font-family: var(--font-display); font-size: 28px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.2; }
.sh-meta { margin: 8px 0 0; font-size: 14.5px; color: var(--paper-3); }
.sh-chip { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; padding: 4px 11px; border-radius: 999px; font-size: 12.5px; font-weight: 500; border: 1px solid; }
.sh-chip-ok { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-line); }
.sh-chip-warn { color: var(--warn); background: var(--warn-soft); border-color: var(--warn-line); }
.sh-dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 18px; row-gap: 10px; margin: 18px 0 0; padding-top: 16px; border-top: 1px solid var(--line); font-size: 14px; }
.sh-dl dt { color: var(--paper-3); }
.sh-dl dd { margin: 0; overflow-wrap: anywhere; }
.sh-code { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.sh-dl a { color: var(--brand); text-decoration: none; }
.sh-dl a:hover { text-decoration: underline; text-underline-offset: 2px; }
.sh-primary { display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; margin-top: 20px; border-radius: 999px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow-lift);
  font-size: 15px; font-weight: 500; text-decoration: none; }
.sh-primary:hover { background: #ffffff; }
.sh-primary:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ink-2), 0 0 0 4px var(--brand); }
.sh-help { margin: 16px 0 0; font-size: 14px; color: var(--paper-3); line-height: 1.55; }
.sh-help a { color: var(--paper); font-weight: 500; text-decoration: none; }
.sh-help a:hover { text-decoration: underline; text-underline-offset: 2px; }
.sh-error { text-align: center; padding: 36px 24px; }
.sh-error-icon { width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }
.sh-footer { padding: 20px 16px 28px; text-align: center; font-size: 12.5px; color: var(--paper-4); }
@media (max-width: 560px) { .sh-dl { grid-template-columns: minmax(0, 1fr); row-gap: 2px; } .sh-dl dd { margin-bottom: 8px; } }
`;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`sh ${fontClass}`}>
      <style>{SHARE_CSS}</style>
      <header className="sh-header">
        <BrandMark size={30} />
        <div>
          <div className="sh-brand">DigiVault</div>
          <div className="sh-brand-sub">Shared document</div>
        </div>
      </header>
      <main className="sh-main">{children}</main>
      <footer className="sh-footer">Shared via DigiVault</footer>
    </div>
  );
}

export default async function SharedDocumentPage({ params }: { params: { token: string } }) {
  const result = await resolveShareView(params.token, clientIpFromHeaders(headers()));

  if (result.status !== "OK") {
    const message = ERROR_MESSAGES[result.status];
    return (
      <Frame>
        <div className="sh-card sh-error" role="alert">
          <div className="sh-error-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="m8 8 8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="sh-title" style={{ fontSize: 22 }}>{message.title}</h1>
          <p className="sh-meta">{message.detail}</p>
        </div>
      </Frame>
    );
  }

  const { document, recipientLabel, expiresAt, viewsRemaining } = result;
  const version = document.redactedVersion;
  const anchored = Boolean(version?.polygonTxHash);

  return (
    <Frame>
      <p className="sh-notice">
        This link expires on {formatDate(expiresAt)} · {viewsRemaining} view{viewsRemaining === 1 ? "" : "s"} remaining
      </p>

      <section className="sh-card">
        <p className="sh-case">{document.caseNumber}</p>
        <h1 className="sh-title">{document.title}</h1>
        <p className="sh-meta">
          {document.docType} · Shared with {recipientLabel}
        </p>

        {version && (
          <>
            {anchored ? (
              <span className="sh-chip sh-chip-ok">Anchored on Polygon Amoy</span>
            ) : (
              <span className="sh-chip sh-chip-warn">Not yet anchored</span>
            )}
            <dl className="sh-dl">
              <dt>Version</dt>
              <dd>{version.versionNo} (redacted)</dd>
              <dt>Created</dt>
              <dd>{formatDate(version.timestamp)}</dd>
              <dt>Merkle root</dt>
              <dd>
                <code className="sh-code" title={version.merkleRoot}>{shortHash(version.merkleRoot)}</code>
              </dd>
              {version.polygonTxHash && (
                <>
                  <dt>Polygon transaction</dt>
                  <dd>
                    <a className="sh-code" href={`https://amoy.polygonscan.com/tx/${version.polygonTxHash}`} target="_blank" rel="noreferrer">
                      {shortHash(version.polygonTxHash)}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <a className="sh-primary" href={`/api/v1/shares/${params.token}/download`}>
              Download redacted document (PDF)
            </a>
          </>
        )}
        {!version && <p className="sh-help">No redacted version of this document is available yet.</p>}
      </section>

      <p className="sh-help">
        This copy has the areas confirmed by the officer blacked out. To check a document against its public blockchain record, use the{" "}
        <Link href="/verify">verification page</Link> with a verification bundle from the sharing officer.
      </p>
    </Frame>
  );
}
