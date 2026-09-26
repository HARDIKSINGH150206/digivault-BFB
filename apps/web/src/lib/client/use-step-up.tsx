"use client";

import { useCallback, useRef, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { apiJson, ApiError } from "./api-client";

export const STEP_UP_HEADER = "X-StepUp-Token";

/** Thrown by requestStepUp when the officer closes the dialog. */
export class StepUpCancelled extends Error {
  constructor() {
    super("Identity verification cancelled.");
  }
}

type Mode = "biometric" | "enroll" | "pin";

interface OptionsResponse {
  // Passed straight through to @simplewebauthn/browser.
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"] & Parameters<typeof startRegistration>[0]["optionsJSON"];
  challenge_token: string;
}

interface StepUpResponse {
  step_up_token: string;
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.name === "NotAllowedError") return "Verification was cancelled or timed out.";
  if (err instanceof Error && err.name === "InvalidStateError") return "This device is already registered. Use fingerprint / Face ID.";
  return err instanceof Error ? err.message : String(err);
}

/**
 * Step-up authentication for high-stakes actions. `requestStepUp(label)`
 * opens a "Verify your identity" dialog and resolves with a 5-minute
 * step-up token once the officer passes WebAuthn (fingerprint / Face ID),
 * or the PIN fallback when the browser has no WebAuthn. Render
 * `stepUpDialog` somewhere in the page.
 */
export function useStepUp() {
  const [label, setLabel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("biometric");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const pending = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(null);

  const requestStepUp = useCallback((actionLabel: string) => {
    pending.current?.reject(new StepUpCancelled());
    const supported = browserSupportsWebAuthn();
    setWebauthnSupported(supported);
    setMode(supported ? "biometric" : "pin");
    setPin("");
    setError(null);
    setBusy(false);
    setLabel(actionLabel);
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
    });
  }, []);

  function finish(token: string) {
    pending.current?.resolve(token);
    pending.current = null;
    setLabel(null);
  }

  function cancel() {
    pending.current?.reject(new StepUpCancelled());
    pending.current = null;
    setLabel(null);
  }

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const verifyBiometric = () =>
    run(async () => {
      let opts: OptionsResponse;
      try {
        opts = await apiJson<OptionsResponse>("/api/auth/webauthn/authenticate/options", { method: "POST" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setMode("enroll");
          return;
        }
        throw err;
      }
      const response = await startAuthentication({ optionsJSON: opts.options });
      const res = await apiJson<StepUpResponse>("/api/auth/webauthn/authenticate/verify", {
        method: "POST",
        body: JSON.stringify({ response, challenge_token: opts.challenge_token }),
      });
      finish(res.step_up_token);
    });

  const enrollBiometric = () =>
    run(async () => {
      const opts = await apiJson<OptionsResponse>("/api/auth/webauthn/register/options", { method: "POST" });
      const response = await startRegistration({ optionsJSON: opts.options });
      const res = await apiJson<StepUpResponse>("/api/auth/webauthn/register/verify", {
        method: "POST",
        body: JSON.stringify({ response, challenge_token: opts.challenge_token, pin }),
      });
      finish(res.step_up_token);
    });

  const verifyPin = () =>
    run(async () => {
      const res = await apiJson<StepUpResponse>("/api/auth/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      finish(res.step_up_token);
    });

  const stepUpDialog =
    label === null ? null : (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-up-title"
        onKeyDown={(e) => e.key === "Escape" && !busy && cancel()}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          display: "grid",
          placeItems: "center",
          padding: 16,
          background: "rgba(4,5,8,0.72)",
          backdropFilter: "blur(4px)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 380,
            background: "linear-gradient(165deg, rgba(22,33,52,0.96) 0%, rgba(10,15,24,0.96) 100%)",
            border: "1px solid rgba(74,144,196,0.35)",
            borderRadius: 8,
            padding: 26,
            boxShadow: "0 0 60px rgba(30,80,160,0.25), 0 24px 60px rgba(0,0,0,0.5)",
            color: "#e2e8f0",
          }}
        >
          <p style={{ margin: "0 0 6px", color: "#4a90c4", fontSize: 10, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>
            Step-up authentication
          </p>
          <h2 id="step-up-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
            Verify your identity
          </h2>
          <p style={{ margin: "8px 0 18px", color: "#9ca3af", fontSize: 13, lineHeight: 1.5 }}>
            Required to <strong style={{ color: "#e2e8f0" }}>{label}</strong>.
          </p>

          {mode === "biometric" && (
            <button onClick={verifyBiometric} disabled={busy} style={primaryButton(busy)} autoFocus>
              {busy ? "Waiting for device…" : "Use fingerprint / Face ID"}
            </button>
          )}

          {(mode === "enroll" || mode === "pin") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pin && !busy) (mode === "enroll" ? enrollBiometric : verifyPin)();
              }}
              style={{ display: "grid", gap: 8 }}
            >
              {mode === "enroll" && (
                <p style={{ margin: "0 0 4px", color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>
                  No fingerprint / Face ID is set up for your account yet. Enter your PIN to register this device.
                </p>
              )}
              {mode === "pin" && !webauthnSupported && (
                <p style={{ margin: "0 0 4px", color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>
                  This browser doesn&apos;t support biometric verification. Re-enter your PIN instead.
                </p>
              )}
              <label htmlFor="step-up-pin" style={{ fontSize: 12, color: "#9ca3af" }}>
                PIN
              </label>
              <input
                id="step-up-pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "11px 12px",
                  fontSize: 14,
                  letterSpacing: 4,
                  color: "#e2e8f0",
                  background: "#0a0f1a",
                  border: "1px solid #1e3a5f",
                  borderRadius: 4,
                }}
              />
              <button type="submit" disabled={busy || !pin} style={primaryButton(busy || !pin)}>
                {busy ? "Verifying…" : mode === "enroll" ? "Register fingerprint / Face ID" : "Verify PIN"}
              </button>
            </form>
          )}

          {error && <p style={{ margin: "12px 0 0", color: "#ef4444", fontSize: 13 }}>{error}</p>}
          {error && mode === "biometric" && (
            <button onClick={() => { setMode("enroll"); setError(null); }} disabled={busy} style={{ ...linkButton, marginTop: 8 }}>
              New device? Register this device&apos;s fingerprint / Face ID
            </button>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16, fontSize: 12 }}>
            {webauthnSupported && mode !== "pin" ? (
              <button onClick={() => { setMode("pin"); setError(null); }} disabled={busy} style={linkButton}>
                Use PIN instead
              </button>
            ) : webauthnSupported && mode === "pin" ? (
              <button onClick={() => { setMode("biometric"); setError(null); }} disabled={busy} style={linkButton}>
                Use fingerprint / Face ID
              </button>
            ) : (
              <span />
            )}
            <button onClick={cancel} disabled={busy} style={{ ...linkButton, color: "#9ca3af" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );

  return { requestStepUp, stepUpDialog };
}

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: 12,
    fontSize: 14,
    fontWeight: 700,
    color: "#f9fafb",
    background: disabled ? "#1f2937" : "#3b82f6",
    border: `1px solid ${disabled ? "#1f2937" : "#3b82f6"}`,
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#60a5fa",
  cursor: "pointer",
  fontSize: 12,
};
