"use client";

/**
 * Public landing page at /. Presentation only: no API calls. Every number
 * shown is either sample data inside the clearly labelled product preview,
 * or comes from the docs (grid-size proof of concept in
 * docs/03-crypto-and-merkle-spec.md, chain id and checks from
 * docs/04-api-spec.md section 5). Roles mirror lib/client/permissions.ts.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark, Icon, type IconName } from "../dashboard/_workspace/shell";
import { LANDING_CSS } from "./landing-css";

function Arrow() {
  return (
    <svg className="lp-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ---------- Nav ---------- */

function Nav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`lp-nav ${scrolled ? "lp-nav-scrolled" : ""}`}>
      <div className="lp-wrap lp-nav-inner">
        <Link href="/" className="lp-brand" aria-label="DigiVault home">
          <BrandMark size={24} />
          DigiVault
        </Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#custody">Chain of custody</a>
          <a href="#verify">Verification</a>
          <a href="#roles">Roles</a>
        </nav>
        <div className="lp-nav-cta">
          {signedIn ? (
            <Link href="/dashboard" className="lp-btn lp-btn-dark lp-btn-sm">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-textlink">
                Sign in
              </Link>
              <Link href="/verify" className="lp-btn lp-btn-dark lp-btn-sm">
                Verify a document
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero + product preview ---------- */

const DOC_LINES: { w: string; redact?: [string, string]; flag?: [string, string] }[] = [
  { w: "92%" },
  { w: "86%", redact: ["30%", "34%"] },
  { w: "96%" },
  { w: "70%", redact: ["12%", "26%"] },
  { w: "90%", flag: ["54%", "30%"] },
  { w: "82%" },
  { w: "94%", redact: ["40%", "28%"] },
  { w: "60%" },
  { w: "88%" },
  { w: "76%" },
];

function ProductPreview() {
  return (
    <div className="lp-frame-wrap" aria-label="Product preview with sample data" role="img">
      <div className="lp-frame">
        <aside className="lp-frame-side" aria-hidden="true">
          <div className="lp-frame-brand">
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "#0a0a0a", display: "grid", placeItems: "center" }}>
              <BrandMark size={16} />
            </span>
            <div>
              <b>DigiVault</b>
              <span>Women Safety Division</span>
            </div>
          </div>
          <div className="lp-frame-search">
            Search cases <span style={{ fontSize: 11 }}>⌘K</span>
          </div>
          <div className="lp-frame-label">Workspace</div>
          <div className="lp-frame-nav lp-frame-nav-on">
            <Icon name="home" size={16} /> Cases
          </div>
          <div className="lp-frame-nav">
            <Icon name="upload" size={16} /> Upload evidence
          </div>
          <div className="lp-frame-nav">
            <Icon name="review" size={16} /> Redaction review <span className="lp-frame-count">3</span>
          </div>
          <div className="lp-frame-nav">
            <Icon name="shield" size={16} /> Verify evidence
          </div>
          <div className="lp-frame-label" style={{ marginTop: 10 }}>
            Recent cases
          </div>
          {["2026/1123 · Witness statement", "2026/1098 · FIR", "2026/1071 · Forensic report"].map((c) => (
            <div key={c} className="lp-frame-nav" style={{ fontSize: 12.5, color: "#737373", paddingTop: 5, paddingBottom: 5 }}>
              {c}
            </div>
          ))}
        </aside>

        <div className="lp-frame-main" aria-hidden="true">
          <div className="lp-frame-top">
            <span className="lp-frame-crumb">‹ Case 2026/1123</span>
            <span className="lp-frame-sample">Sample data</span>
          </div>
          <div className="lp-frame-head">
            <div>
              <div className="lp-frame-eyebrow">Version 2 · redacted</div>
              <div className="lp-frame-title">Witness statement</div>
              <div className="lp-frame-sub">3 tiles masked after officer confirmation</div>
            </div>
            <div className="lp-chips">
              <span className="lp-chip lp-chip-ink">Redacted</span>
              <span className="lp-chip lp-chip-ok">
                <span className="lp-chip-dot" /> Anchored
              </span>
            </div>
          </div>
          <div className="lp-frame-cols">
            <div className="lp-doc">
              <div className="lp-doc-grid" />
              <div className="lp-doc-h" />
              <div className="lp-doc-s" />
              <div className="lp-doc-lines">
                {DOC_LINES.map((l, i) => (
                  <div key={i} className="lp-doc-line" style={{ width: l.w }}>
                    {l.redact && <span className="lp-doc-redact" style={{ left: l.redact[0], width: l.redact[1] }} />}
                    {l.flag && <span className="lp-doc-flag" style={{ left: l.flag[0], width: l.flag[1] }} />}
                  </div>
                ))}
              </div>
              <span className="lp-doc-stamp">
                <Tick /> 20 × 20 tile grid
              </span>
            </div>
            <div className="lp-side-stack">
              <div className="lp-mini">
                <div className="lp-mini-title">
                  Merkle root <span className="lp-mini-sub">SHA-256</span>
                </div>
                <div className="lp-mini-hash lp-mono">51aa…9902</div>
              </div>
              <div className="lp-mini">
                <div className="lp-mini-title">Anchors</div>
                <div className="lp-mini-row">
                  <span className="lp-mini-check"><Tick size={10} /></span>
                  <span>
                    MinIO Object Lock<small>Compliance mode</small>
                  </span>
                </div>
                <div className="lp-mini-row">
                  <span className="lp-mini-check"><Tick size={10} /></span>
                  <span>
                    Polygon Amoy<small className="lp-mono">tx 0x7f3c…</small>
                  </span>
                  <span className="lp-mini-val">80002</span>
                </div>
              </div>
              <div className="lp-mini">
                <div className="lp-mini-title">
                  AI suggestions <span className="lp-mini-sub">officer confirms</span>
                </div>
                {[
                  { t: "Victim name", s: "IndicNER", c: 93 },
                  { t: "Phone number", s: "Text layer", c: 98 },
                  { t: "Address", s: "Bhashini OCR", c: 81 },
                ].map((r) => (
                  <div key={r.t} className="lp-mini-row" style={{ display: "block" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{r.t}</span>
                      <span style={{ color: "#737373" }}>
                        {r.c}% · {r.s}
                      </span>
                    </div>
                    <div className="lp-bar">
                      <span style={{ width: `${r.c}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-hero-bg" />
      <div className="lp-hero-grid" />
      <div className="lp-wrap">
        <Link href="/verify" className="lp-pill">
          <span className="lp-pill-tag">Public</span>
          Court Verification Portal, no login needed
        </Link>
        <h1 id="lp-title" className="lp-h1">
          Evidence that proves it was never changed
        </h1>
        <p className="lp-lede">
          DigiVault fingerprints every page of a case file in the officer&apos;s browser, anchors it on a public blockchain, and lets a court check it
          without trusting us.
        </p>
        <div className="lp-hero-actions">
          <Link href={signedIn ? "/dashboard" : "/login"} className="lp-btn lp-btn-light">
            {signedIn ? "Open dashboard" : "Sign in with service number"} <Arrow />
          </Link>
          <span className="lp-hero-proof">
            <span className="lp-hero-proof-icon">
              <Icon name="shield" size={22} />
            </span>
            <span>
              <strong>Built for NCRB</strong> · Women Safety Division
              <br />
              Designed around BNS s.72 and BSA 2023 §63
            </span>
          </span>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function Strip() {
  return (
    <section className="lp-strip" aria-label="Standards and infrastructure">
      <div className="lp-wrap">
        <p className="lp-strip-label">Built on open standards a court can check independently</p>
        <div className="lp-strip-row">
          {["SHA-256", "Merkle trees", "Polygon Amoy", "MinIO Object Lock", "WebAuthn", "BSA 2023 §63"].map((s) => (
            <span key={s} className="lp-strip-item">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Features (tabbed) ---------- */

type Feature = { title: string; body: string; card: React.ReactNode };

const FEATURES: Feature[] = [
  {
    title: "Hash in the browser",
    body: "Every page becomes a lossless PNG and a 20 × 20 grid. Each tile is hashed and folded into one Merkle root before anything leaves the device.",
    card: (
      <>
        <div className="lp-fcard-top">
          <span>witness-statement.pdf</span>
          <span className="lp-chip lp-chip-blue">In browser</span>
        </div>
        <div className="lp-fcard-big">
          264<small>ms</small>
        </div>
        <ul className="lp-fcard-list">
          {["Render 5 pages with PDF.js", "Export lossless PNG", "Hash 2,000 tiles", "Build the Merkle tree"].map((s) => (
            <li key={s}>
              <span className="lp-mini-check"><Tick size={10} /></span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <div className="lp-fcard-foot">Measured in our grid-size proof of concept</div>
      </>
    ),
  },
  {
    title: "Server re-verifies",
    body: "The server recomputes every tile hash from the PNGs it received. One mismatched tile and the upload is refused, with nothing stored.",
    card: (
      <>
        <div className="lp-fcard-top">
          <span>Upload check</span>
          <span className="lp-chip lp-chip-ok">
            <span className="lp-chip-dot" /> Match
          </span>
        </div>
        <ul className="lp-fcard-list" style={{ marginTop: 16 }}>
          <li>
            <span style={{ color: "#737373" }}>Client root</span>
            <span className="lp-fcard-meta lp-mono" style={{ color: "#262626", fontSize: 12.5 }}>238b…cb2b</span>
          </li>
          <li>
            <span style={{ color: "#737373" }}>Server root</span>
            <span className="lp-fcard-meta lp-mono" style={{ color: "#262626", fontSize: 12.5 }}>238b…cb2b</span>
          </li>
          <li>
            <span style={{ color: "#737373" }}>Tiles re-hashed</span>
            <span className="lp-fcard-meta" style={{ color: "#262626" }}>2,000 / 2,000</span>
          </li>
        </ul>
        <div className="lp-fcard-foot">A mismatch returns 409 and names the tile</div>
      </>
    ),
  },
  {
    title: "Anchor twice",
    body: "Each version's root is written to MinIO with Object Lock and to the EvidenceAnchor contract on Polygon Amoy. Even an admin with database access can't rewrite either.",
    card: (
      <>
        <div className="lp-fcard-top">
          <span>Version 2</span>
          <span className="lp-chip lp-chip-ok">
            <span className="lp-chip-dot" /> Anchored
          </span>
        </div>
        <ul className="lp-fcard-list" style={{ marginTop: 16 }}>
          <li>
            <span className="lp-mini-check"><Tick size={10} /></span>
            <span>MinIO · Object Lock</span>
            <span className="lp-fcard-meta">immutable</span>
          </li>
          <li>
            <span className="lp-mini-check"><Tick size={10} /></span>
            <span>Polygon Amoy</span>
            <span className="lp-fcard-meta lp-mono">0x7f3c…</span>
          </li>
          <li>
            <span className="lp-mini-check"><Tick size={10} /></span>
            <span>Chained to version 1</span>
            <span className="lp-fcard-meta lp-mono">7de4…f110</span>
          </li>
        </ul>
        <div className="lp-fcard-foot">Runs in the background after every upload</div>
      </>
    ),
  },
  {
    title: "Redact with a human",
    body: "AI suggests tiles with names, phone numbers, Aadhaar numbers and addresses. An officer confirms with a fingerprint, and the server creates a new, chained version.",
    card: (
      <>
        <div className="lp-fcard-top">
          <span>Suggestions</span>
          <span className="lp-chip lp-chip-blue">Needs officer</span>
        </div>
        <ul className="lp-fcard-list" style={{ marginTop: 14, gap: 12 }}>
          {[
            { t: "Victim name", c: 93, s: "IndicNER" },
            { t: "Aadhaar number", c: 99, s: "Text layer" },
            { t: "Address", c: 81, s: "Bhashini OCR" },
          ].map((r) => (
            <li key={r.t} style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{r.t}</span>
                <span style={{ color: "#a3a3a3", fontSize: 12 }}>
                  {r.c}% · {r.s}
                </span>
              </div>
              <div className="lp-bar">
                <span style={{ width: `${r.c}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <div className="lp-fcard-foot">AI output never touches a hash</div>
      </>
    ),
  },
];

function Features() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), 7000);
    return () => window.clearTimeout(t);
  }, [active, reduced, paused]);

  return (
    <section id="how" className="lp-section" aria-labelledby="lp-how">
      <div className="lp-wrap">
        <h2 id="lp-how" className="lp-h2">
          Everything between an upload and a courtroom
        </h2>
        <div className="lp-feature-stage" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="lp-feature-tiles" />
          <div key={active} className="lp-fcard" aria-live="polite">
            {FEATURES[active].card}
          </div>
        </div>
        <div className="lp-tabs" role="tablist" aria-label="How DigiVault works">
          {FEATURES.map((f, i) => {
            const on = i === active;
            return (
              <button
                key={f.title}
                type="button"
                role="tab"
                aria-selected={on}
                className={`lp-tab ${on ? "lp-tab-on" : ""} ${on && (reduced || paused) ? "lp-tab-static" : ""}`}
                onClick={() => setActive(i)}
              >
                <span key={on ? `on-${active}` : "off"} className="lp-tab-bar" />
                <span className="lp-tab-title">{f.title}</span>
                {on && <p className="lp-tab-body">{f.body}</p>}
              </button>
            );
          })}
        </div>
        <div className="lp-feature-actions">
          <Link href="/login" className="lp-btn lp-btn-dark">
            Start a case <Arrow />
          </Link>
          <Link href="/verify" className="lp-textlink">
            Verify a document
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Chain of custody ---------- */

const FLOW: { icon: IconName; title: string; body: string; tags: string[] }[] = [
  { icon: "upload", title: "Upload", body: "An officer drops a scan or PDF into a case.", tags: ["FIR", "Charge sheet", "Statement"] },
  { icon: "fingerprint", title: "Client hash", body: "Pages, tiles and the Merkle root are computed in the browser.", tags: ["PNG only", "20 × 20"] },
  { icon: "check", title: "Server re-hash", body: "The server recomputes everything and stores its own values.", tags: ["409 on mismatch"] },
  { icon: "anchor", title: "Dual anchor", body: "The root goes to MinIO Object Lock and Polygon Amoy.", tags: ["MinIO", "Polygon"] },
  { icon: "shield", title: "Court verifies", body: "Anyone checks the PNG and proof against the chain.", tags: ["No login", "No DigiVault server"] },
];

function Custody() {
  return (
    <section id="custody" className="lp-section" aria-labelledby="lp-custody">
      <div className="lp-wrap">
        <div className="lp-head-row">
          <div>
            <h2 id="lp-custody" className="lp-h2">
              One chain of custody, five steps
            </h2>
            <p className="lp-sub">
              Every version is hashed, checked, anchored and chained to the one before it. If OCR fails on a crooked, stained scan, the proof
              still holds.
            </p>
          </div>
        </div>
      </div>
      <div className="lp-canvas">
        <div className="lp-wrap">
          <ol className="lp-flow" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FLOW.map((n, i) => {
              const last = i === FLOW.length - 1;
              return (
                <li key={n.title} className={`lp-node ${last ? "lp-node-end" : ""}`}>
                  <div className="lp-node-head">
                    <span className="lp-node-icon">
                      <Icon name={n.icon} size={17} />
                    </span>
                    {n.title}
                    <span className="lp-node-step">0{i + 1}</span>
                  </div>
                  <p className="lp-node-body">{n.body}</p>
                  <div className="lp-node-tag">
                    {n.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  {!last && (
                    <>
                      <span className="lp-node-wire" aria-hidden="true" />
                      <span className="lp-node-port" aria-hidden="true" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="lp-flow-note">
            <span className="lp-dot-ok" /> Redaction is optional and creates version 2. It never replaces version 1.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Verification ---------- */

type Tok = [string, "key" | "str" | "num" | "pun" | ""];
const PROOF: Tok[][] = [
  [["{", "pun"]],
  [['  "digivault_proof_version"', "key"], [": ", "pun"], ["1", "num"], [",", "pun"]],
  [['  "document_version_id"', "key"], [": ", "pun"], ['"ckver790"', "str"], [",", "pun"]],
  [['  "grid_size"', "key"], [": ", "pun"], ["20", "num"], [",", "pun"]],
  [['  "page_count"', "key"], [": ", "pun"], ["5", "num"], [",", "pun"]],
  [['  "merkle_root"', "key"], [": ", "pun"], ['"51aa…9902"', "str"], [",", "pun"]],
  [['  "tiles"', "key"], [": ", "pun"], ["[ … 2,000 tile hashes … ]", "pun"], [",", "pun"]],
  [['  "anchor"', "key"], [": ", "pun"], ["{", "pun"]],
  [['    "polygon_chain_id"', "key"], [": ", "pun"], ["80002", "num"], [",", "pun"]],
  [['    "polygon_tx_hash"', "key"], [": ", "pun"], ['"0x7f3c…"', "str"], [",", "pun"]],
  [['    "anchored_at"', "key"], [": ", "pun"], ['"2026-09-15T10:24:02Z"', "str"]],
  [["  }", "pun"]],
  [["}", "pun"]],
];

const CHECKS: { t: string; d: string }[] = [
  { t: "Proof file is well-formed", d: "Version 1, 20 × 20 grid, 5 pages" },
  { t: "Every tile hash matches", d: "Re-tiled from the PNG pixels in this browser" },
  { t: "Recomputed root equals the proof", d: "Merkle tree rebuilt from scratch" },
  { t: "RPC reports chain 80002", d: "Polygon Amoy" },
  { t: "On-chain root matches", d: "Read from the official contract, never one named in the file" },
];

function Verification() {
  return (
    <section id="verify" className="lp-section" aria-labelledby="lp-verify">
      <div className="lp-wrap">
        <span className="lp-eyebrow">
          <span className="lp-eyebrow-icon">
            <Icon name="shield" size={14} />
          </span>
          Court Verification Portal
        </span>
        <h2 id="lp-verify" className="lp-h2">
          Anyone can check it. No account, no trust in us.
        </h2>
        <p className="lp-sub">
          Drop a redacted page and its proof file into the portal. The portal recomputes everything in your browser and reads the root
          straight from the blockchain.
        </p>
        <div className="lp-dev">
          <div className="lp-code">
            <div className="lp-code-tabs">
              <span className="lp-code-tab lp-code-tab-on">
                <span className="lp-code-badge">JSON</span>verification-proof.json
              </span>
              <span className="lp-code-tab">page-1.png</span>
            </div>
            <div className="lp-code-body lp-mono" aria-label="Example verification proof file">
              {PROOF.map((line, i) => (
                <div key={i} className={`lp-code-line ${i === 5 || i === 8 ? "lp-code-line-on" : ""}`}>
                  <span className="lp-code-num">{i + 1}</span>
                  <span>
                    {line.map(([text, kind], j) => (
                      <span key={j} className={kind ? `lp-tk-${kind}` : undefined}>
                        {text}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="lp-code-foot lp-mono">
              <span>JSON · UTF-8 · example</span>
              <span>
                <span style={{ color: "var(--ok)" }}>●</span> chain 80002
              </span>
            </div>
          </div>
          <div className="lp-resp">
            <div className="lp-resp-head">
              Verification
              <span className="lp-resp-live">
                <i /> Runs in your browser
              </span>
            </div>
            <ul className="lp-checks">
              {CHECKS.map((c, i) => (
                <li key={c.t} className="lp-check" style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="lp-check-icon">
                    <Tick size={10} />
                  </span>
                  <span>
                    {c.t}
                    <small>{c.d}</small>
                  </span>
                </li>
              ))}
            </ul>
            <div className="lp-verdict">
              <Icon name="shield" size={18} /> Example result: verified against the official DigiVault contract
            </div>
            <div className="lp-stats">
              <div className="lp-stat">
                <small>Tiles checked</small>
                <b>2,000</b>
              </div>
              <div className="lp-stat">
                <small>Chain</small>
                <b>80002</b>
              </div>
              <div className="lp-stat">
                <small>DigiVault servers contacted</small>
                <b>0</b>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-feature-actions">
          <Link href="/verify" className="lp-btn lp-btn-light">
            Open the portal <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Roles ---------- */

const ROLES = ["Police Officer", "Investigating Officer", "Court Official", "Forensic Lab", "Admin"] as const;
const HIGHLIGHT = 1;
const ROLE_GROUPS: { group: string; rows: { label: string; allowed: boolean[] }[] }[] = [
  {
    group: "Evidence",
    rows: [
      { label: "Open cases and upload evidence", allowed: [true, true, false, false, true] },
      { label: "Review and confirm redactions", allowed: [true, true, false, false, true] },
    ],
  },
  {
    group: "Integrity",
    rows: [
      { label: "Read versions and anchor status", allowed: [true, true, true, true, true] },
      { label: "Download proof and BSA certificate", allowed: [true, true, true, true, true] },
      { label: "Retry anchoring", allowed: [false, true, false, false, true] },
    ],
  },
  {
    group: "Sharing",
    rows: [{ label: "Create and revoke share links", allowed: [false, true, false, false, true] }],
  },
];

function Roles() {
  return (
    <section id="roles" className="lp-section" aria-labelledby="lp-roles">
      <div className="lp-wrap">
        <h2 id="lp-roles" className="lp-h2">
          Each role sees exactly what it should
        </h2>
        <p className="lp-sub">Five roles, enforced by the server on every request. Fingerprint step-up guards redaction, anchoring and certificates.</p>
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    Permission
                  </span>
                </th>
                {ROLES.map((r, i) => (
                  <th key={r} scope="col" className={i === HIGHLIGHT ? "lp-col-hi" : undefined}>
                    {r}
                    {i === HIGHLIGHT && <small>Full case workflow</small>}
                  </th>
                ))}
              </tr>
            </thead>
            {ROLE_GROUPS.map((g) => (
              <tbody key={g.group}>
                <tr className="lp-table-group">
                  <th scope="rowgroup" colSpan={ROLES.length + 1}>
                    {g.group}
                  </th>
                </tr>
                {g.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.allowed.map((ok, i) => (
                      <td key={i} className={i === HIGHLIGHT ? "lp-col-hi" : undefined}>
                        {ok ? (
                          <span className="lp-yes" aria-label="Allowed">
                            <Tick size={15} />
                          </span>
                        ) : (
                          <span className="lp-no" aria-label="Not allowed">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="lp-table-note">Share links only ever serve a redacted version. The original upload is never shared.</p>
      </div>
    </section>
  );
}

/* ---------- CTA + footer ---------- */

function Cta({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="lp-wrap">
      <section className="lp-cta" aria-labelledby="lp-cta">
        <div className="lp-cta-dots" />
        <h2 id="lp-cta" className="lp-h2">
          Put every case file on a chain of custody
        </h2>
        <p className="lp-sub">Sign in with your service number to open a case, or check a document you were sent.</p>
        <div className="lp-cta-actions">
          <Link href={signedIn ? "/dashboard" : "/login"} className="lp-btn lp-btn-light">
            {signedIn ? "Open dashboard" : "Sign in"} <Arrow />
          </Link>
          <Link href="/verify" className="lp-btn lp-btn-dark">
            Verify a document
          </Link>
        </div>
      </section>
    </div>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-row">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <BrandMark size={20} /> DigiVault · NCRB Women Safety Division · Smart India Hackathon
        </span>
        <nav className="lp-footer-links" aria-label="Footer">
          <Link href="/login">Sign in</Link>
          <Link href="/verify">Verify</Link>
          <span>Anchors on Polygon Amoy testnet</span>
        </nav>
      </div>
    </footer>
  );
}

export function Landing() {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  return (
    <div className={`lp ${fontClass}`}>
      <style>{LANDING_CSS}</style>
      <Nav signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <Strip />
        <Features />
        <Custody />
        <Verification />
        <Roles />
        <Cta signedIn={signedIn} />
      </main>
      <Footer />
    </div>
  );
}
