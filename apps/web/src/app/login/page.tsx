"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/client/auth-context";
import { ApiError } from "@/lib/client/api-client";
import { loginGlobeArcs, loginGlobeConfig } from "./globe-config";
import { TextHoverEffect } from "@/lib/client/text-hover-effect";
import { manrope, inter } from "@/lib/client/fonts";
import { ShieldIcon } from "@/lib/client/shield-icon";
import { CornerBracket } from "@/lib/client/corner-bracket";

// WebGL/Canvas only exists in the browser — same reasoning as the original
// Aceternity demo's dynamic import, and cheap insurance against yet another
// SSR/hydration mismatch on this page (we've hit two real ones already).
const World = dynamic(() => import("@/lib/client/globe").then((m) => m.World), { ssr: false });

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  fontSize: 14,
  color: "#e2e8f0",
  background: "#0a0f1a",
  border: "1px solid #1e3a5f",
  borderRadius: 4,
  outline: "none",
};

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 15a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.24 1.24"
        stroke="#4a90c4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 9a5 5 0 0 0-7.07 0L5.1 11.83a5 5 0 0 0 7.07 7.07l1.24-1.24"
        stroke="#4a90c4"
        strokeWidth="2"
        strokeLinecap="round"
      />
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

  const canSubmit = serviceNumber.trim().length > 0 && pin.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(serviceNumber.trim(), pin);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 401 || err.status === 429) ? err.message : "Login failed.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className={`login-frame ${inter.variable} ${manrope.variable} ${inter.className}`}
      style={{
        position: "relative",
        // Height comes from the .login-frame CSS class (100dvh where
        // supported, 100vh fallback — see the <style> block below), not an
        // inline style: inline styles always beat stylesheet rules, so
        // setting height here would silently block the dvh upgrade. dvh
        // accounts for mobile browser chrome (address bar etc.) that vh
        // ignores, which is the most common real-world cause of a page
        // that measures "non-scrollable" in a plain viewport test but
        // still shows a scrollbar in an actual browser.
        boxSizing: "border-box",
        width: "100vw",
        maxWidth: "100%",
        display: "grid",
        placeItems: "center",
        padding: 24,
        overflow: "hidden",
        backgroundColor: "#040508",
        backgroundImage: [
          "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.75) 100%)",
          "linear-gradient(rgba(30,60,100,0.16) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(30,60,100,0.16) 1px, transparent 1px)",
          "radial-gradient(ellipse at center, rgba(20,50,100,0.35) 0%, transparent 65%)",
        ].join(","),
        backgroundSize: "100% 100%, 40px 40px, 40px 40px, 100% 100%",
      }}
    >
      {/*
        Keep data URIs and mixed quotes out of this raw <style> child — they
        caused an SSR/CSR text-escaping hydration mismatch before. Only
        pseudo-class rules that inline style can't express live here.
      */}
      <style>{`
        html, body {
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
        }
        .login-frame {
          height: 100vh;
        }
        @supports (height: 100dvh) {
          .login-frame {
            height: 100dvh;
          }
        }
        .login-input:focus {
          border-color: #4a90c4 !important;
        }
        .login-input::placeholder {
          color: #4b5563;
        }
        .login-submit:not(:disabled):hover {
          background: #263348 !important;
          border-color: #4a90c4 !important;
        }
      `}</style>

      {/* Globe stays centered and visible through the card (which is now
          semi-transparent) rather than masked out behind it — only the
          far outer edge fades into the background. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          transform: "translateY(-6%)",
        }}
      >
        <div style={{ width: "min(1200px, 150vw, 150vh)", aspectRatio: "1 / 1" }}>
          <World data={loginGlobeArcs} globeConfig={loginGlobeConfig} />
        </div>
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background: "radial-gradient(circle at 50% 44%, transparent 0%, transparent 42%, #040508 68%)",
        }}
      />

      {/* Wordmark in the top-left corner, horizontal — outlined text that
          only fills in with color where the cursor passes over it. No
          rotation this time; sized as a corner mark, not a full-bleed hero. */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 24,
          width: "min(320px, 38vw)",
          height: "min(110px, 14vh)",
          zIndex: 1,
        }}
      >
        <TextHoverEffect text="DIGIVAULT" viewBoxWidth={320} fontSize="3rem" strokeWidth={0.9} />
      </div>

      <div style={{ position: "relative", zIndex: 2, display: "grid", justifyItems: "center" }}>
        <div style={{ marginBottom: 18 }}>
          <ShieldIcon />
        </div>

        <section
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 380,
            background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(74, 144, 196, 0.25)",
            borderRadius: 6,
            boxShadow:
              "0 0 0 1px rgba(74,144,196,0.06), 0 0 60px rgba(30,80,160,0.22), 0 24px 60px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset",
            padding: 36,
          }}
        >
          <CornerBracket corner="tl" />
          <CornerBracket corner="tr" />
          <CornerBracket corner="bl" />
          <CornerBracket corner="br" />
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "12%",
              right: "12%",
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.9), transparent)",
            }}
          />
          <p
            style={{
              margin: "0 0 10px",
              color: "#4a90c4",
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: 700,
              textTransform: "uppercase",
              fontFamily: "var(--font-display)",
            }}
          >
            NCRB Evidence Infrastructure
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 30,
                fontWeight: 800,
                color: "#e2e8f0",
                lineHeight: 1.1,
                fontFamily: "var(--font-display)",
                letterSpacing: -0.5,
              }}
            >
              DigiVault
            </h1>
            <LinkIcon />
          </div>
          <p style={{ margin: "10px 0 0", color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
            Secure Evidence Management for NCRB Women Safety Division
          </p>

          <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "grid", gap: 8 }}>
            <label htmlFor="service-number" style={{ fontSize: 12, color: "#9ca3af" }}>
              Service Number
            </label>
            <input
              id="service-number"
              className="login-input"
              value={serviceNumber}
              onChange={(e) => setServiceNumber(e.target.value)}
              placeholder="e.g. DL/2019/3301"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ ...INPUT_STYLE, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: 0.5 }}
            />

            <label htmlFor="pin" style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
              PIN
            </label>
            <input
              id="pin"
              className="login-input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              style={{ ...INPUT_STYLE, letterSpacing: 4 }}
            />

            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="login-submit"
              style={{
                marginTop: 6,
                width: "100%",
                padding: 12,
                fontSize: 14,
                color: "#cbd5e1",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 4,
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.6,
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              {submitting ? "Signing in…" : "Proceed to DigiVault"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
