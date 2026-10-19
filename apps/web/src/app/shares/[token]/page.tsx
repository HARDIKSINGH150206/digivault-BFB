import { headers } from "next/headers";
import Link from "next/link";
import { resolveShareView } from "@/lib/shares-repo";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark } from "../../dashboard/_workspace/shell";
import { ShareVerifyDownloads } from "./verify-downloads";

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
.sh a:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.sh-header { height: 60px; display: flex; align-items: center; gap: 10px; padding: 0 24px; background: var(--ink); border-bottom: 1px solid var(--line-2); }
.sh-brand { font-weight: 600; font-size: 15px; letter-spacing: -0.02em; line-height: 1.1; }
.sh-brand-sub { margin-top: 2px; font-family: var(--font-mono), monospace; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper-4); }
.sh-main { flex: 1; width: 100%; max-width: 620px; margin: 0 auto; padding: 64px 16px 48px; }
.sh-notice { margin: 0 0 16px; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--line-2); font-size: 14px; color: var(--paper-2); }
.sh-card { border: 1px solid var(--line-2); border-radius: 12px; padding: 28px; }
.sh-case { margin: 0 0 12px; font-family: var(--font-mono), monospace; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper-4); }
.sh-title { margin: 0; font-size: 28px; font-weight: 500; letter-spacing: -0.025em; line-height: 1.2; }
.sh-meta { margin: 8px 0 0; font-size: 14.5px; color: var(--paper-3); }
.sh-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; margin-top: 18px; padding: 0 9px; border-radius: 6px; font-size: 12.5px; font-weight: 500; border: 1px solid var(--line-2); color: var(--paper-2); }
.sh-chip::before { content: attr(data-none); width: 6px; height: 6px; border-radius: 50%; background: var(--chip); }
.sh-chip-ok { --chip: var(--ok); }
.sh-chip-warn { --chip: var(--warn); }
.sh-dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 24px; row-gap: 0; margin: 22px 0 0; font-size: 14px; }
.sh-dl dt, .sh-dl dd { padding: 11px 0; border-top: 1px solid var(--line); }
.sh-dl dt { color: var(--paper-4); }
.sh-dl dd { margin: 0; overflow-wrap: anywhere; color: var(--paper-2); }
.sh-code { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.sh-dl a { color: var(--paper); text-decoration: underline; text-decoration-color: var(--line-3); text-underline-offset: 3px; }
.sh-dl a:hover { text-decoration-color: var(--paper); }
.sh-primary { display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; margin-top: 22px; border: 1px solid var(--paper); border-radius: 10px; background: var(--paper); color: var(--ink);
  font-size: 15px; font-weight: 500; text-decoration: none; transition: background-color 120ms ease; }
.sh-primary:hover { background: #ffffff; border-color: #ffffff; }
.sh-secondary { display: flex; align-items: center; justify-content: center; width: 100%; height: 44px; margin-top: 10px; border: 1px solid var(--line-3); border-radius: 10px; background: transparent; color: var(--paper);
  font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; transition: border-color 120ms ease; }
.sh-secondary:hover { border-color: var(--paper-3); }
.sh-secondary:disabled { cursor: progress; color: var(--paper-3); }
.sh-secondary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.sh-msg { margin: 10px 0 0; font-size: 13.5px; color: var(--paper-2); line-height: 1.5; }
.sh-msg-error { color: var(--danger); }
.sh-help { margin: 16px 0 0; font-size: 14px; color: var(--paper-3); line-height: 1.55; }
.sh-help a { color: var(--paper); font-weight: 500; text-decoration: underline; text-decoration-color: var(--line-3); text-underline-offset: 3px; }
.sh-help a:hover { text-decoration-color: var(--paper); }
.sh-error { text-align: center; padding: 40px 24px; }
.sh-error-icon { width: 44px; height: 44px; margin: 0 auto 16px; border-radius: 10px; display: grid; place-items: center; border: 1px solid var(--danger-line); color: var(--danger); }
.sh-footer { padding: 20px 16px 28px; text-align: center; font-size: 12.5px; color: var(--paper-4); }
@media (max-width: 560px) { .sh-main { padding-top: 40px; } .sh-card { padding: 22px; } .sh-dl { grid-template-columns: minmax(0, 1fr); } .sh-dl dd { border-top: 0; padding-top: 0; } }
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
              <dt>Anchored commitment</dt>
              <dd>
                <code className="sh-code" title={version.commitment}>{shortHash(version.commitment)}</code>
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
            {anchored && <ShareVerifyDownloads token={params.token} />}
          </>
        )}
        {!version && <p className="sh-help">No redacted version of this document is available yet.</p>}
      </section>

      <p className="sh-help">
        This copy has the areas confirmed by the officer blacked out. To check that nothing else was changed, download the verification files and add
        them on the <Link href="/verify">verification page</Link>. It compares the page images with the original document&apos;s public blockchain
        record without revealing what was blacked out.
      </p>
    </Frame>
  );
}
