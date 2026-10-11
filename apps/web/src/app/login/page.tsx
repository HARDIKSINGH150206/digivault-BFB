"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";
import { ApiError } from "@/lib/client/api-client";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark } from "../dashboard/_workspace/shell";
import { LpIcon } from "../_landing/icons";

/*
 * Page-local CSS for what inline styles can't express (hover/focus states,
 * media queries). Deliberately free of quote, ampersand and angle-bracket
 * characters: React escapes those differently on the server and client
 * inside a <style> text child, which previously caused a real hydration
 * mismatch on this page.
 *
 * Flat surfaces only: solid fills and hairline borders, no gradients or glows.
 */
const PAGE_CSS = `
.lg { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); background: var(--ink); color: var(--paper); }
@supports (min-height: 100dvh) { .lg { min-height: 100dvh; } }
.lg *, .lg *::before, .lg *::after { box-sizing: border-box; }

.lg-main { display: flex; flex-direction: column; min-height: inherit; padding: 28px 24px; }
.lg-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.lg-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--paper); text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
.lg-back { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: var(--paper-3); text-decoration: none; transition: color 120ms ease; }
.lg-back:hover { color: var(--paper); }

.lg-center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 0; }
.lg-form-wrap { width: 100%; max-width: 380px; }

.lg-kicker { margin: 0; font-family: var(--font-mono), monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper-4); }
.lg-title { margin: 14px 0 0; font-size: 32px; line-height: 1.15; font-weight: 500; letter-spacing: -0.025em; }
.lg-sub { margin: 10px 0 0; font-size: 15px; line-height: 1.55; color: var(--paper-3); }

.lg-form { margin-top: 32px; display: grid; row-gap: 18px; }
.lg-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.lg-label { font-size: 13px; font-weight: 500; color: var(--paper-2); }
.lg-hint { font-size: 12px; color: var(--paper-4); }
.lg-field-box { position: relative; margin-top: 8px; }
.lg-input { display: block; width: 100%; height: 44px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--ink-3);
  font: inherit; font-size: 15px; color: var(--paper); transition: border-color 120ms ease, box-shadow 120ms ease; }
.lg-input-pin { padding-right: 48px; letter-spacing: 0.12em; }
.lg-input:hover:not(:disabled) { border-color: var(--line-3); }
.lg-input:focus-visible { outline: none; border-color: var(--paper-3); box-shadow: 0 0 0 3px rgba(242,239,233,0.08); }
.lg-input:disabled { color: var(--paper-4); }
.lg-input::placeholder { color: var(--paper-4); letter-spacing: 0; }
.lg-reveal { position: absolute; right: 6px; top: 6px; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 7px;
  background: transparent; color: var(--paper-4); cursor: pointer; transition: color 120ms ease, background-color 120ms ease; }
.lg-reveal:hover { color: var(--paper); background: var(--ink-4); }

.lg-alert { margin: 0; display: flex; gap: 10px; align-items: flex-start; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--danger-line);
  background: var(--danger-soft); color: var(--danger); font-size: 14px; line-height: 1.45; }

.lg-btn { height: 44px; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px;
  font: inherit; font-size: 15px; font-weight: 500; text-decoration: none; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
.lg-primary { margin-top: 6px; border: 1px solid var(--paper); background: var(--paper); color: var(--ink); }
.lg-primary:hover:not(:disabled) { background: #ffffff; border-color: #ffffff; }
.lg-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.lg-secondary { border: 1px solid var(--line-2); background: transparent; color: var(--paper); }
.lg-secondary:hover { border-color: var(--line-3); background: var(--ink-3); }

.lg-or { margin: 28px 0 20px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; column-gap: 14px; font-size: 12px; color: var(--paper-4); }
.lg-or::before, .lg-or::after { content: attr(data-none); height: 1px; background: var(--line-2); }
.lg-note { margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: var(--paper-4); text-align: center; }

.lg-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-3); border-top-color: var(--paper-2); animation: lg-spin 800ms linear infinite; }

.lg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; font-size: 12.5px; color: var(--paper-4); }
.lg-foot a { color: var(--paper-3); text-decoration: none; }
.lg-foot a:hover { color: var(--paper); }

.lg a:focus-visible, .lg button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.lg-input:focus-visible { outline: none; }

.lg-aside { display: none; }

@media (min-width: 1024px) {
  .lg { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .lg-main { padding: 32px 48px; }
  .lg-aside { display: flex; flex-direction: column; justify-content: space-between; gap: 48px; padding: 32px 56px 40px; background: var(--ink-3); border-left: 1px solid var(--line); }
}
@media (min-width: 1280px) {
  .lg-main { padding: 32px 64px; }
  .lg-aside { padding: 32px 80px 48px; }
}

.lg-aside-top { display: flex; justify-content: flex-end; }
.lg-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: 999px; font-family: var(--font-mono), monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper-4); }

.lg-aside-body { max-width: 520px; width: 100%; margin: 0 auto; }
.lg-aside-title { margin: 0; font-size: 30px; line-height: 1.2; font-weight: 500; letter-spacing: -0.025em; }
.lg-aside-title span { color: var(--paper-4); }

.lg-record { margin-top: 32px; border: 1px solid var(--line-2); border-radius: 14px; background: var(--ink); }
.lg-record-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.lg-record-name { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; }
.lg-record-name svg { color: var(--paper-3); }
.lg-sealed { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ok); }
.lg-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }
.lg-rows { margin: 0; padding: 4px 20px; }
.lg-row { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; column-gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); }
.lg-row:first-child { border-top: 0; }
.lg-row dt { font-size: 13px; color: var(--paper-4); }
.lg-row dd { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; font-size: 13.5px; color: var(--paper-2); }
.lg-row dd span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-mono { font-family: var(--font-mono), monospace; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-check { flex: none; color: var(--ok); }

.lg-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 520px; width: 100%; margin: 0 auto; border-top: 1px solid var(--line-2); }
.lg-stat { padding: 18px 16px 0 0; }
.lg-stat + .lg-stat { padding-left: 16px; border-left: 1px solid var(--line); }
.lg-stat b { display: block; white-space: nowrap; font-size: clamp(17px, 1.6vw, 22px); font-weight: 500; letter-spacing: -0.02em; }
.lg-stat span { display: block; margin-top: 4px; font-size: 12.5px; line-height: 1.4; color: var(--paper-4); }

@keyframes lg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .lg *, .lg *::before, .lg *::after { animation: none !important; transition: none !important; }
}
`;

// Illustrative values for the side panel only; labelled "Sample record" on screen.
const RECORD: { label: string; value: string; mono?: boolean; ok?: boolean }[] = [
  { label: "Merkle root", value: "9f3a7c41e0b2d58a6c19f04e7d2b83a5c6e1f0947b2d8c3e5a61f9b04d7e2c18", mono: true },
  { label: "Tiles", value: "6 pages · 20 × 20 grid" },
  { label: "MinIO Object Lock", value: "Retained · compliance mode", ok: true },
  { label: "Polygon Amoy", value: "Anchored · chain 80002", ok: true },
  { label: "Signed off by", value: "Investigating officer" },
];

export default function LoginPage() {
  const { login, session } = useAuth();
  const router = useRouter();
  const [serviceNumber, setServiceNumber] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(serviceNumber.trim(), pin);
      router.push("/dashboard");
    } catch (err) {
      // 401 (wrong service number or PIN) and 429 (rate limited) carry a message meant for the user.
      setError(err instanceof ApiError && (err.status === 401 || err.status === 429) ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = serviceNumber.trim().length > 0 && pin.length > 0 && !submitting;

  return (
    <main className={`lg ${fontClass}`}>
      <style>{PAGE_CSS}</style>

      <div className="lg-main">
        <header className="lg-top">
          <Link href="/" className="lg-brand">
            <BrandMark size={22} />
            DigiVault
          </Link>
          <Link href="/" className="lg-back">
            <LpIcon name="back" size={16} />
            Home
          </Link>
        </header>

        <div className="lg-center">
          <section className="lg-form-wrap" aria-labelledby="lg-title">
            <p className="lg-kicker">NCRB · Women Safety Division</p>
            <h1 id="lg-title" className="lg-title">
              Sign in to DigiVault
            </h1>
            <p className="lg-sub">For authorised investigating officers and staff. Use the service number and PIN issued to you.</p>

            <form onSubmit={handleSubmit} className="lg-form" aria-busy={submitting} noValidate>
              <div>
                <div className="lg-label-row">
                  <label htmlFor="service-number" className="lg-label">
                    Service number
                  </label>
                </div>
                <div className="lg-field-box">
                  <input
                    id="service-number"
                    className="lg-input"
                    value={serviceNumber}
                    onChange={(e) => setServiceNumber(e.target.value)}
                    placeholder="XX/2024/0000"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={submitting}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <div className="lg-label-row">
                  <label htmlFor="pin" className="lg-label">
                    PIN
                  </label>
                  <span className="lg-hint">Issued by your unit administrator</span>
                </div>
                <div className="lg-field-box">
                  <input
                    id="pin"
                    className="lg-input lg-input-pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    className="lg-reveal"
                    onClick={() => setShowPin((v) => !v)}
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    aria-pressed={showPin}
                    aria-controls="pin"
                  >
                    <LpIcon name={showPin ? "lock" : "eye"} size={17} />
                  </button>
                </div>
              </div>

              {error && (
                <p className="lg-alert" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="lg-btn lg-primary" disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <span className="lg-spinner" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <div className="lg-or" data-none="">
              Checking a shared document?
            </div>
            <Link href="/verify" className="lg-btn lg-secondary">
              Verify without signing in
            </Link>
            <p className="lg-note">All sign-ins are recorded in the audit log.</p>
          </section>
        </div>

        <footer className="lg-foot">
          <span>© 2026 DigiVault</span>
          <span>
            Court portal: <Link href="/verify">/verify</Link>
          </span>
        </footer>
      </div>

      <aside className="lg-aside" aria-label="What a sealed record looks like">
        <div className="lg-aside-top">
          <span className="lg-tag">Sample record</span>
        </div>

        <div className="lg-aside-body">
          <h2 className="lg-aside-title">
            Every version is hashed, sealed and anchored twice. <span>Courts can check it without an account.</span>
          </h2>

          <div className="lg-record">
            <div className="lg-record-head">
              <span className="lg-record-name">
                <LpIcon name="file" size={18} />
                Case file · v2 redacted
              </span>
              <span className="lg-sealed">
                <span className="lg-dot" aria-hidden="true" />
                Sealed
              </span>
            </div>
            <dl className="lg-rows">
              {RECORD.map((r) => (
                <div key={r.label} className="lg-row">
                  <dt>{r.label}</dt>
                  <dd>
                    <span className={r.mono ? "lg-mono" : undefined}>{r.value}</span>
                    {r.ok && <LpIcon name="check" size={16} className="lg-check" />}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="lg-stats">
          <div className="lg-stat">
            <b>SHA-256</b>
            <span>Per tile, hashed in the browser</span>
          </div>
          <div className="lg-stat">
            <b>2 anchors</b>
            <span>Object Lock and Polygon</span>
          </div>
          <div className="lg-stat">
            <b>0 logins</b>
            <span>Needed to verify</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
