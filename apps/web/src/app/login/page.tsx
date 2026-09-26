"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";
import { ApiError } from "@/lib/client/api-client";
import { manrope, inter } from "@/lib/client/fonts";
import { EvidenceStory } from "./evidence-illustration";

/*
 * Page-local CSS for what inline styles can't express (hover/focus states,
 * media queries). Deliberately free of quote, ampersand and angle-bracket
 * characters: React escapes those differently on the server and client
 * inside a <style> text child, which previously caused a real hydration
 * mismatch on this page.
 */
const PAGE_CSS = `
.dv-login { min-height: 100vh; box-sizing: border-box; color: #1D2226; background: #F6F8FA; display: flex; flex-direction: column; }
@supports (min-height: 100dvh) { .dv-login { min-height: 100dvh; } }
.dv-login *, .dv-login *::before, .dv-login *::after { box-sizing: border-box; }

.dv-shell { width: 100%; max-width: 1440px; margin: 0 auto; padding: 0 24px; }
.dv-header { display: flex; align-items: center; padding-top: 28px; padding-bottom: 12px; }

.dv-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; padding-top: 24px; padding-bottom: 48px; flex: 1; align-content: center; }
.dv-intro { grid-row: 1; }
.dv-card { grid-row: 2; }
.dv-story-slot { display: none; }

@media (min-width: 820px) {
  .dv-shell { padding: 0 40px; }
  .dv-grid { grid-template-columns: minmax(0, 1fr) minmax(360px, 420px); column-gap: 56px; row-gap: 36px; }
  .dv-intro { grid-column: 1; grid-row: 1; align-self: end; }
  .dv-story-slot { grid-column: 1; grid-row: 2; align-self: start; }
  .dv-card { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
}
@media (min-width: 1024px) {
  .dv-story-slot { display: block; }
}
@media (min-width: 1180px) {
  .dv-shell { padding: 0 64px; }
  .dv-grid { column-gap: 80px; }
}

.dv-eyebrow { margin: 0 0 20px; font-size: 12.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: #5E5E5E; }
.dv-headline { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: clamp(44px, 5.2vw, 78px); line-height: 0.98; letter-spacing: -0.04em; word-spacing: 0.14em; color: #1D2226; }
.dv-word { white-space: nowrap; }
.dv-accent { color: #0A66C2; }
.dv-lede { margin: 22px 0 0; max-width: 500px; font-size: 17px; line-height: 1.55; color: #5E5E5E; }

.dv-card-panel { background: #FFFFFF; border: 1px solid #E3E8ED; border-radius: 12px; padding: 36px 36px 30px; box-shadow: 0 1px 3px rgba(29,34,38,0.06); }
@media (max-width: 480px) { .dv-card-panel { padding: 28px 22px 24px; } }

.dv-field + .dv-field { margin-top: 16px; }
.dv-label { display: block; font-size: 14px; font-weight: 600; color: #1D2226; }
.dv-input { display: block; width: 100%; height: 48px; margin-top: 8px; border: 1px solid #D0D7DE; border-radius: 8px; background: #FFFFFF; padding: 0 14px; font: inherit; font-size: 15.5px; color: #1D2226; transition: border-color 120ms ease, box-shadow 120ms ease; }
.dv-input:hover:not(:disabled) { border-color: #8A939B; }
.dv-input:focus-visible { outline: none; border-color: #0A66C2; box-shadow: 0 0 0 3px rgba(10,102,194,0.2); }
.dv-input:disabled { background: #F6F8FA; color: #8A939B; }
.dv-input::placeholder { color: #8A939B; }

.dv-primary { width: 100%; height: 48px; margin-top: 20px; border: 0; border-radius: 8px; background: #0A66C2; color: #FFFFFF;
  font: inherit; font-size: 15.5px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  cursor: pointer; transition: background-color 120ms ease; }
.dv-primary:hover:not(:disabled) { background: #004182; }
.dv-primary:focus-visible { outline: none; box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px #0A66C2; }
.dv-primary:disabled { background: #E3E8ED; color: #6B737A; cursor: not-allowed; }

.dv-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.45); border-top-color: #FFFFFF; animation: dv-spin 800ms linear infinite; }

.dv-alert { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: #FDF1F1; border: 1px solid #F4C7C8; color: #A30D12; font-size: 14px; line-height: 1.45; }

.dv-verify-line { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid #E3E8ED; font-size: 14px; color: #5E5E5E; }
.dv-verify-line a { color: #0A66C2; font-weight: 600; text-decoration: none; }
.dv-verify-line a:hover { text-decoration: underline; text-underline-offset: 2px; }
.dv-verify-line a:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; border-radius: 2px; }

.dv-story { position: relative; overflow: hidden; padding: 44px 40px 30px; border-radius: 22px; border: 1px solid rgba(208,215,222,0.55);
  background: radial-gradient(120% 90% at 85% 30%, rgba(10,102,194,0.07) 0%, rgba(10,102,194,0) 55%), linear-gradient(180deg, #FFFFFF 0%, #EEF3F8 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.9); }
.dv-story-texture { position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(29,34,38,0.08) 1px, transparent 1.3px); background-size: 18px 18px;
  -webkit-mask-image: radial-gradient(ellipse at 60% 40%, black 5%, transparent 72%); mask-image: radial-gradient(ellipse at 60% 40%, black 5%, transparent 72%); }
.dv-story-bloom { position: absolute; right: -10%; top: -12%; width: 58%; height: 125%; pointer-events: none;
  background: radial-gradient(closest-side, rgba(10,102,194,0.13), rgba(10,102,194,0)); animation: dv-bloom 11s ease-in-out infinite; }
.dv-orbits { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

.dv-story-track { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; column-gap: 4px; }
.dv-step { display: grid; justify-items: center; row-gap: 14px; }
.dv-rise { width: 100%; max-width: 176px; animation: dv-rise 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.dv-float { perspective: 1200px; animation: dv-float 9s ease-in-out infinite; }
.dv-tilt { position: relative; }
.dv-tilt-1 { transform: rotateY(-14deg) rotateX(6deg); }
.dv-tilt-2 { transform: rotateY(-9deg) rotateX(5deg); }
.dv-tilt-3 { transform: rotateY(-4deg) rotateX(4deg); }
.dv-echo { position: absolute; inset: 0; border-radius: 10px; border: 1px solid rgba(29,34,38,0.07);
  background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(233,239,245,0.95)); box-shadow: 0 10px 22px -16px rgba(29,34,38,0.25); }
.dv-ground { width: 72%; height: 14px; margin: 14px auto 0; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(29,34,38,0.16), rgba(29,34,38,0)); animation: dv-ground 9s ease-in-out infinite; }

.dv-connector { align-self: center; margin-bottom: 64px; overflow: visible; }
.dv-connector-path { stroke-dasharray: 1; stroke-dashoffset: 0; animation: dv-draw 650ms ease-out both; }
.dv-connector-flow { stroke-dasharray: 0.14 1.4; stroke-dashoffset: 0.14; opacity: 0; animation: dv-flow 6.5s ease-in-out infinite; }
.dv-node { transform-box: fill-box; transform-origin: center; animation: dv-node 400ms ease-out both; }

.dv-sheet { position: relative; width: 100%; aspect-ratio: 0.77; padding: 14% 12%; border-radius: 10px; border: 1px solid rgba(29,34,38,0.09);
  background: linear-gradient(180deg, #FFFFFF 0%, #FBFCFD 100%);
  box-shadow: inset 0 1px 0 #FFFFFF, 0 1px 2px rgba(29,34,38,0.05), 0 14px 28px -16px rgba(29,34,38,0.22), 0 30px 60px -34px rgba(10,60,120,0.28); }
.dv-sheet-verifiable { border-color: rgba(10,102,194,0.22); }
.dv-sheet-title { width: 58%; height: 8px; border-radius: 4px; background: #AEB9C4; }
.dv-sheet-sub { width: 34%; height: 5px; margin-top: 7px; border-radius: 3px; background: #D5DCE3; }
.dv-sheet-rule { height: 1px; margin: 12% 0 10%; background: #E7ECF1; }
.dv-sheet-lines { display: grid; row-gap: 8px; }
.dv-sheet-row { position: relative; height: 5px; }
.dv-sheet-line { height: 5px; border-radius: 3px; background: #E7ECF1; }
.dv-sheet-redact { position: absolute; top: -2px; height: 9px; border-radius: 2px; background: #1D2226; transform-origin: left center; animation: dv-redact 520ms cubic-bezier(0.3, 0.7, 0.2, 1) both; }
.dv-sheet-foot { display: flex; align-items: flex-end; column-gap: 10%; margin-top: 12%; }
.dv-sheet-photo { position: relative; width: 38%; aspect-ratio: 4 / 3; flex: none; border-radius: 4px; overflow: hidden; }
.dv-photo-mask { position: absolute; inset: 0; background: #1D2226; animation: dv-mask 500ms ease-out both; }

.dv-scan { position: absolute; left: 6%; right: 6%; top: 94%; height: 2px; opacity: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(10,102,194,0), rgba(10,102,194,0.55), rgba(10,102,194,0));
  box-shadow: 0 0 14px 2px rgba(10,102,194,0.18); animation: dv-scan 1150ms ease-in-out 420ms both; }
.dv-sheet-grid { position: absolute; inset: 0; border-radius: 10px; pointer-events: none;
  background-image: linear-gradient(rgba(10,102,194,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(10,102,194,0.12) 1px, transparent 1px);
  background-size: 10% 7.7%; animation: dv-fade 800ms ease-out both; }
.dv-print { position: absolute; right: 7%; top: 5%; width: 30%; opacity: 0.4; pointer-events: none; }
.dv-print-arc { stroke-dasharray: 1; stroke-dashoffset: 0; animation: dv-draw 700ms ease-out both; }
.dv-seal { position: absolute; right: -14px; bottom: -14px; width: 44px; height: 44px; border-radius: 50%; background: #057642; display: grid; place-items: center;
  box-shadow: 0 0 0 5px #FFFFFF, 0 10px 22px -8px rgba(5,118,66,0.5); animation: dv-pop 500ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
.dv-seal-ring { position: absolute; right: -14px; bottom: -14px; width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(5,118,66,0.45);
  opacity: 0; pointer-events: none; animation: dv-ring 1100ms ease-out both; }

.dv-step-cap { display: flex; align-items: baseline; column-gap: 8px; }
.dv-step-num { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #0A66C2; }
.dv-step-label { font-size: 15px; font-weight: 600; color: #1D2226; }

@keyframes dv-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes dv-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(-0.35deg); } }
@keyframes dv-ground { 0%, 100% { transform: scaleX(1); opacity: 1; } 50% { transform: scaleX(0.9); opacity: 0.7; } }
@keyframes dv-bloom { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
@keyframes dv-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes dv-flow { 0% { stroke-dashoffset: 0.14; opacity: 0; } 4% { opacity: 0.9; } 30% { opacity: 0.9; } 36% { stroke-dashoffset: -1.1; opacity: 0; } 100% { stroke-dashoffset: -1.1; opacity: 0; } }
@keyframes dv-node { from { opacity: 0; transform: scale(0.3); } to { opacity: 1; transform: scale(1); } }
@keyframes dv-redact { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes dv-mask { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
@keyframes dv-scan { 0% { top: 4%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 94%; opacity: 0; } }
@keyframes dv-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dv-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
@keyframes dv-ring { 0% { opacity: 0; transform: scale(0.9); } 10% { opacity: 0.6; } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes dv-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .dv-login *, .dv-login *::before, .dv-login *::after { animation: none !important; transition: none !important; }
}
`;

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 30 33" fill="none" aria-hidden="true">
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2C8.1 28.9 3 23.6 3 15.3V6L15 1.5Z" fill="#12306B" />
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2V1.5Z" fill="#0A66C2" />
      <path d="m10.2 15.6 3.3 3.3 6.4-6.8" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, session } = useAuth();
  const router = useRouter();
  const [serviceNumber, setServiceNumber] = useState("");
  const [pin, setPin] = useState("");
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
    <main className={`dv-login ${inter.variable} ${manrope.variable} ${inter.className}`}>
      <style>{PAGE_CSS}</style>

      <div className="dv-shell">
        <header className="dv-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <BrandMark />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 25, letterSpacing: -0.5, color: "#1D2226" }}>
              DigiVault
            </span>
          </div>
        </header>

        <div className="dv-grid">
          <section className="dv-intro" aria-labelledby="dv-headline">
            <p className="dv-eyebrow">NCRB · Women Safety Division</p>
            <h1 id="dv-headline" className="dv-headline">
              <span className="dv-word">Preserve.</span> <span className="dv-word">Protect.</span>{" "}
              <span className="dv-word dv-accent">Prove.</span>
            </h1>
            <p className="dv-lede">Store case evidence securely, redact what must stay private, and let courts confirm nothing has changed.</p>
          </section>

          <div className="dv-story-slot">
            <EvidenceStory />
          </div>

          <section className="dv-card" aria-labelledby="dv-signin">
            <div className="dv-card-panel">
              <h2 id="dv-signin" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
                Sign in
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5, color: "#5E5E5E" }}>Use your service number and PIN.</p>

              <form onSubmit={handleSubmit} style={{ marginTop: 26 }} aria-busy={submitting}>
                <div className="dv-field">
                  <label htmlFor="service-number" className="dv-label">Service number</label>
                  <input
                    id="service-number"
                    className="dv-input"
                    value={serviceNumber}
                    onChange={(e) => setServiceNumber(e.target.value)}
                    placeholder="e.g. XX/2024/0000"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="dv-field">
                  <label htmlFor="pin" className="dv-label">PIN</label>
                  <input
                    id="pin"
                    className="dv-input"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                  />
                </div>

                {error && (
                  <p className="dv-alert" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" className="dv-primary" disabled={!canSubmit}>
                  {submitting ? (
                    <>
                      <span className="dv-spinner" aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <p className="dv-verify-line">
                Checking a shared document? <Link href="/verify">Verify it without signing in</Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
