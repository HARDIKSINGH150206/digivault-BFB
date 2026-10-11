"use client";

/**
 * Public landing page at /. Presentation only: no API calls. Every number
 * shown is either sample data inside the clearly labelled product preview,
 * or comes from the docs (grid-size proof of concept in
 * docs/03-crypto-and-merkle-spec.md, chain id and checks from
 * docs/04-api-spec.md section 5). Roles mirror lib/client/permissions.ts.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { fontClass } from "@/lib/client/fonts";
import { BrandMark } from "../dashboard/_workspace/shell";
import { CustodyGraph } from "./custody-graph";
import { Arrow, LpIcon, type LpIconName } from "./icons";
import { LANDING_CSS } from "./landing-css";
import { TileField } from "./tile-field";

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

/** True once the element has scrolled into view (stays true). */
function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/* ---------- Nav ---------- */

function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="lp-nav">
      <div className="lp-wrap-wide lp-nav-inner">
        <Link href="/" className="lp-brand" aria-label="DigiVault home">
          <BrandMark size={22} />
          DigiVault
        </Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#custody">Custody</a>
          <a href="#portal">Verification</a>
          <a href="#roles">Roles</a>
        </nav>
        <div className="lp-nav-cta">
          {signedIn ? (
            <Link href="/dashboard" className="lp-btn lp-btn-dark lp-btn-sm">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="lp-navlink">
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

/* ---------- Product preview (light app window, sample data) ---------- */

const SPARK = "M0,34 C10,30 16,12 26,16 C36,20 40,36 52,32 C62,28 66,10 78,14 C90,18 94,38 106,34 C118,30 122,22 132,26 C142,30 148,40 160,30 C170,22 178,16 196,14";

function ProductPreview() {
  return (
    <div className="lp-app" role="img" aria-label="DigiVault case workspace with sample data">
      <aside className="lp-app-side" aria-hidden="true">
        <div className="lp-app-brand">
          <span className="lp-app-logo">
            <BrandMark size={16} />
          </span>
          <span>
            <b>DigiVault</b>
            <small>Evidence</small>
          </span>
        </div>
        <div className="lp-app-search">
          <LpIcon name="search" size={14} /> Search <kbd>⌘K</kbd>
        </div>
        <p className="lp-app-label">Main</p>
        {(
          [
            ["folder-cases", "Cases", "file"],
            ["upload", "Upload evidence", "upload"],
            ["review", "Redaction review", "user-check"],
            ["verify", "Verify", "shield"],
            ["audit", "Audit log", "list"],
          ] as [string, string, LpIconName][]
        ).map(([k, label, icon], i) => (
          <div key={k} className={`lp-app-nav ${i === 0 ? "lp-app-nav-on" : ""}`}>
            <LpIcon name={icon} size={15} /> {label}
            {k === "review" && <span className="lp-app-count">3</span>}
          </div>
        ))}
        <div className="lp-app-sep" />
        <div className="lp-app-group">
          Recent cases <LpIcon name="chevron-down" size={14} />
        </div>
        <div className="lp-app-recent">
          {["Witness statement, 1123", "FIR scan, 1098", "Forensic report, 1071", "Charge sheet, 1064", "Medical record, 1052", "Statement, 1049"].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="lp-app-sep" />
        <div className="lp-app-nav">
          <LpIcon name="settings" size={15} /> Settings <LpIcon name="chevron-down" size={14} className="lp-app-caret" />
        </div>
        <div className="lp-app-nav">
          <LpIcon name="help" size={15} /> Help center <LpIcon name="chevron-down" size={14} className="lp-app-caret" />
        </div>
        <div className="lp-app-user">
          <div className="lp-app-user-row">
            <span className="lp-app-avatar">RS</span>
            <span>
              <b>Insp. R. Sharma</b>
              <small>Investigating Officer</small>
            </span>
          </div>
          <div className="lp-app-theme">
            <span className="lp-app-theme-on">
              <LpIcon name="sun" size={11} /> Light
            </span>
            <span>
              <LpIcon name="moon" size={11} /> Dark
            </span>
            <span>
              <LpIcon name="monitor" size={11} /> System
            </span>
          </div>
        </div>
      </aside>

      <div className="lp-app-main" aria-hidden="true">
        <div className="lp-app-top">
          <span className="lp-app-chip-btn">
            <LpIcon name="back" size={14} /> Cases
          </span>
          <span className="lp-app-top-r">
            <span className="lp-app-sample">Sample data</span>
            <span className="lp-app-icon-btn">
              <LpIcon name="bell" size={15} />
            </span>
            <span className="lp-app-black-btn">
              <LpIcon name="plus" size={14} stroke={2.2} /> New case
            </span>
            <span className="lp-app-icon-btn">
              <LpIcon name="menu" size={15} />
            </span>
          </span>
        </div>

        <div className="lp-app-banner">
          <div className="lp-app-banner-text">
            <p className="lp-app-eyebrow">Version 2 · redacted</p>
            <h3>Case 2026/1123</h3>
            <p className="lp-app-muted">Witness statement, 6 pages. Sealed and anchored twice.</p>
            <span className="lp-app-black-btn lp-app-banner-btn">
              <LpIcon name="upload" size={14} /> Upload version
            </span>
          </div>
          <div className="lp-app-banner-art">
            <TileField className="lp-fill" tone="light" seed={3} density={0.1} accents={3} redacted={4} pulses={2} />
          </div>
        </div>

        <div className="lp-app-filter">
          <div className="lp-app-seg">
            <span className="lp-app-seg-on">All versions</span>
            <span>Original</span>
            <span>Redacted</span>
            <span>Shared</span>
          </div>
          <span className="lp-app-select">
            <LpIcon name="calendar" size={14} /> Last 7 days <LpIcon name="chevron-down" size={14} />
          </span>
        </div>

        <div className="lp-app-cols">
          <div>
            <p className="lp-app-h">
              <LpIcon name="target" size={15} /> Integrity
            </p>
            <div className="lp-app-metrics">
              <div className="lp-app-card">
                <div className="lp-app-card-top">
                  <span>
                    <b>Hash time</b>
                    <small>witness-statement.pdf</small>
                  </span>
                  <span className="lp-app-mini-seg">
                    <span>1h</span>
                    <span className="lp-app-mini-on">24h</span>
                    <span>7d</span>
                  </span>
                </div>
                <p className="lp-app-num">
                  264 <small>ms</small>
                </p>
                <p className="lp-app-good">5 pages, 2,000 tiles hashed</p>
                <svg viewBox="0 0 200 48" className="lp-app-spark">
                  <line x1="0" y1="40" x2="200" y2="40" stroke="#e5e5e5" strokeDasharray="2 3" />
                  <path d={SPARK} fill="none" stroke="#0099ff" strokeWidth="1.6" />
                  <circle cx="196" cy="14" r="3" fill="#0099ff" />
                </svg>
              </div>
              <div className="lp-app-card">
                <div className="lp-app-card-top">
                  <span>
                    <b>Tiles verified</b>
                    <small>All versions</small>
                  </span>
                </div>
                <p className="lp-app-num">
                  2,000 <small>/ 2,000</small>
                </p>
                <p className="lp-app-muted-s">Server re-hash, last upload 10:24</p>
                <div className="lp-app-bars">
                  {[30, 38, 34, 46, 42, 52, 48, 58, 54, 62, 60, 66, 64, 70, 72].map((h, i, a) => (
                    <span key={i} style={{ height: `${h}%` }} className={i === a.length - 1 ? "lp-app-bar-on" : undefined} />
                  ))}
                </div>
              </div>
            </div>
            <p className="lp-app-h">
              <LpIcon name="layers" size={15} /> Pages
            </p>
            <div className="lp-app-docs">
              <div className="lp-app-doc">
                <span className="lp-app-page">
                  <i />
                  <i />
                  <i className="lp-app-redact" />
                  <i />
                </span>
              </div>
              <div className="lp-app-doc">
                <span className="lp-app-tilegrid" />
              </div>
              <div className="lp-app-doc">
                <LpIcon name="shield" size={34} stroke={1.4} />
              </div>
            </div>
          </div>
          <div>
            <p className="lp-app-h">
              <LpIcon name="chain" size={15} /> Anchors
            </p>
            <div className="lp-app-list">
              {(
                [
                  ["database", "MinIO", "Object Lock · compliance", "locked"],
                  ["chain", "Polygon Amoy", "Chain 80002 · tx 0x7f3c…", "anchored"],
                  ["server", "Server re-hash", "2,000 of 2,000 tiles", "match"],
                  ["layers", "Version 1", "Chained parent · 7de4…", "linked"],
                ] as [LpIconName, string, string, string][]
              ).map(([icon, t, s, b]) => (
                <div key={t} className="lp-app-row">
                  <span className="lp-app-row-icon">
                    <LpIcon name={icon} size={15} />
                  </span>
                  <span className="lp-app-row-text">
                    <b>{t}</b>
                    <small>{s}</small>
                  </span>
                  <span className="lp-app-badge">{b}</span>
                </div>
              ))}
            </div>
            <p className="lp-app-h">
              <LpIcon name="bolt" size={15} /> Quick stats
            </p>
            <div className="lp-app-stats">
              <div className="lp-app-stat">
                <span className="lp-app-row-icon">
                  <LpIcon name="user-check" size={14} />
                </span>
                <span>
                  <b>3</b>
                  <small>Tiles masked</small>
                </span>
              </div>
              <div className="lp-app-stat">
                <span className="lp-app-row-icon">
                  <LpIcon name="target" size={14} />
                </span>
                <span>
                  <b>0</b>
                  <small>Mismatches</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hero ---------- */

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div aria-hidden="true" className="lp-hero-bg">
        <div className="lp-hero-photo">
          <TileField className="lp-fill" seed={7} />
        </div>
        <div className="lp-hero-bottom" />
      </div>
      <div className="lp-hero-inner">
        <Link href="/verify" className="lp-pill lp-rise">
          <span className="lp-pill-tag">Public</span>
          Court verification needs no login
        </Link>
        <h1 id="lp-title" className="lp-h1">
          <span className="lp-word">Evidence</span> <span className="lp-word">that</span> <span className="lp-word">proves</span>{" "}
          <br className="lp-br" />
          <span className="lp-word">it</span> <span className="lp-word">was</span> <span className="lp-word">never</span>{" "}
          <span className="lp-word">changed</span>
        </h1>
        <p className="lp-lede lp-rise lp-d2">
          Every page is fingerprinted in the officer&apos;s browser and anchored on a public chain. A court can check it without trusting us.
        </p>
        <div className="lp-hero-actions lp-rise lp-d3">
          <Link href={signedIn ? "/dashboard" : "/login"} className="lp-btn lp-btn-light">
            {signedIn ? "Open dashboard" : "Sign in"} <Arrow />
          </Link>
          <span className="lp-hero-proof">
            <LpIcon name="shield" size={22} className="lp-hero-proof-icon" />
            <span>
              <b>Built for NCRB</b> · Women Safety
              <br />
              BSA 2023 §63 ready
            </span>
          </span>
        </div>
      </div>
      <div className="lp-wrap lp-hero-app lp-rise lp-d4">
        <ProductPreview />
      </div>
      <div className="lp-wrap lp-strip">
        <p>Built on open standards a court can check on its own</p>
        <div className="lp-strip-row" aria-label="Standards">
          <span className="lp-wm lp-wm-mono">SHA-256</span>
          <span className="lp-wm lp-wm-poly">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3Z" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            polygon
          </span>
          <span className="lp-wm lp-wm-minio">MINIO</span>
          <span className="lp-wm lp-wm-webauthn">WebAuthn</span>
          <span className="lp-wm lp-wm-pdf">PDF.js</span>
          <span className="lp-wm lp-wm-serif">BSA 2023</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- Features: tile-grid panel, floating card, 4 tabs ---------- */

type Step = { label: string; value: string };
type Feature = { title: string; body: string; head: string; badge: string; big: string; unit: string; steps: Step[]; foot: string };

const FEATURES: Feature[] = [
  {
    title: "Hash in the browser",
    body: "Each page becomes a lossless PNG, split into a 20 × 20 grid. Every tile is hashed and folded into one Merkle root before upload.",
    head: "witness-statement.pdf",
    badge: "Live",
    big: "264",
    unit: "ms",
    steps: [
      { label: "Render pages to PNG", value: "5" },
      { label: "Split into tiles", value: "2,000" },
      { label: "Hash raw pixels", value: "SHA-256" },
      { label: "Build the Merkle root", value: "1" },
    ],
    foot: "Proof-of-concept run at 144 dpi",
  },
  {
    title: "Server re-verifies",
    body: "The server recomputes every tile hash from the PNGs it receives. One mismatched tile and the upload is refused, with nothing stored.",
    head: "Upload check",
    badge: "Match",
    big: "2,000",
    unit: "tiles",
    steps: [
      { label: "Client root", value: "238b…cb2b" },
      { label: "Server root", value: "238b…cb2b" },
      { label: "Tiles re-hashed", value: "2,000" },
      { label: "On mismatch", value: "409" },
    ],
    foot: "The client is never trusted on its own",
  },
  {
    title: "Anchor twice",
    body: "Each version root goes to MinIO under Object Lock and to the EvidenceAnchor contract on Polygon Amoy. Neither can be rewritten.",
    head: "Version 2",
    badge: "Anchored",
    big: "2",
    unit: "anchors",
    steps: [
      { label: "MinIO Object Lock", value: "WORM" },
      { label: "Polygon Amoy", value: "80002" },
      { label: "Chained to version 1", value: "7de4…" },
      { label: "Retry if the chain is busy", value: "auto" },
    ],
    foot: "Runs in the background after every upload",
  },
  {
    title: "Redact with a human",
    body: "AI suggests tiles with names, phone and Aadhaar numbers. An officer confirms with a fingerprint or PIN, and a new chained version is made.",
    head: "Suggestions",
    badge: "Officer",
    big: "3",
    unit: "tiles",
    steps: [
      { label: "Victim name", value: "IndicNER" },
      { label: "Aadhaar number", value: "Text layer" },
      { label: "Home address", value: "Bhashini" },
      { label: "Step-up confirmed", value: "PIN" },
    ],
    foot: "AI output never touches a hash",
  },
];

function Features() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const f = FEATURES[active];

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), 7000);
    return () => window.clearTimeout(t);
  }, [active, reduced, paused]);

  return (
    <section id="how" className="lp-section lp-section-first" aria-labelledby="lp-how">
      <div className="lp-wrap">
        <h2 id="lp-how" className="lp-h2 lp-h2-medium">
          Everything between an upload and a courtroom
        </h2>
        <div className="lp-panel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <TileField className="lp-fill lp-tf-panel" seed={19} density={0.09} accents={6} pulses={6} />
          <div key={active} className="lp-float" aria-live="polite">
            <div className="lp-float-top">
              <span>{f.head}</span>
              <span className="lp-live">
                <i /> {f.badge}
              </span>
            </div>
            <p className="lp-float-big">
              {f.big} <small>{f.unit}</small>
            </p>
            <ul className="lp-float-list">
              {f.steps.map((s, i) => (
                <li key={s.label} style={{ animationDelay: `${120 + i * 90}ms` }}>
                  <span className="lp-float-check">
                    <LpIcon name="check" size={10} stroke={3.2} />
                  </span>
                  <span>{s.label}</span>
                  <span className="lp-float-val">{s.value}</span>
                </li>
              ))}
            </ul>
            <p className="lp-float-foot">{f.foot}</p>
          </div>
        </div>
        <div className="lp-tabs" role="tablist" aria-label="How DigiVault works">
          {FEATURES.map((x, i) => {
            const on = i === active;
            return (
              <button key={x.title} type="button" role="tab" aria-selected={on} className={`lp-tab ${on ? "lp-tab-on" : ""}`} onClick={() => setActive(i)}>
                <span className="lp-tab-track">
                  {on && <span key={`bar-${active}`} className={`lp-tab-bar ${reduced || paused ? "lp-tab-bar-full" : ""}`} />}
                </span>
                <span className="lp-tab-title">{x.title}</span>
                <span className="lp-tab-body">{x.body}</span>
              </button>
            );
          })}
        </div>
        <div className="lp-actions">
          <Link href="/login" className="lp-btn lp-btn-dark">
            Start a case <Arrow />
          </Link>
          <Link href="/verify" className="lp-btn lp-btn-ghost">
            Verify a document
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Court portal (dot-matrix pages in place of the map) ---------- */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tile = { x: number; y: number; o: number; kind: 0 | 1 | 2 };
const PAGES = 3;
const GRID = 20;
const PITCH = 20;
const PAGE_GAP = 70;
// Text-like rows: dense dots on "lines", faint margins, a few masked tiles (1) and checked tiles (2).
const TILES: Tile[] = (() => {
  const r = rng(7);
  const out: Tile[] = [];
  for (let p = 0; p < PAGES; p++) {
    for (let row = 0; row < GRID; row++) {
      const lineEnd = row % 4 === 3 ? 0 : 12 + Math.floor(r() * 8);
      for (let col = 0; col < GRID; col++) {
        const text = col >= 2 && col < lineEnd && row >= 2 && row < 18;
        const o = text ? 0.35 + r() * 0.45 : 0.08 + r() * 0.08;
        let kind: 0 | 1 | 2 = 0;
        if (p === 1 && row === 6 && col >= 5 && col <= 9) kind = 1;
        if (p === 1 && row === 11 && col >= 3 && col <= 5) kind = 1;
        if (text && r() < 0.025) kind = 2;
        out.push({ x: p * (GRID * PITCH + PAGE_GAP) + col * PITCH + PITCH / 2, y: row * PITCH + PITCH / 2, o, kind });
      }
    }
  }
  return out;
})();
const MATRIX_W = PAGES * GRID * PITCH + (PAGES - 1) * PAGE_GAP;

function Portal() {
  return (
    <section id="portal" className="lp-portal" aria-labelledby="lp-portal">
      <div className="lp-portal-art" aria-hidden="true">
        <svg viewBox={`-10 -10 ${MATRIX_W + 20} ${GRID * PITCH + 20}`} className="lp-matrix">
          {TILES.map((t, i) =>
            t.kind === 1 ? (
              <rect key={i} x={t.x - 7} y={t.y - 7} width={14} height={14} rx={3} fill="#0099ff" opacity={0.55} />
            ) : t.kind === 2 ? (
              <circle key={i} cx={t.x} cy={t.y} r={2.6} fill="#0099ff" />
            ) : (
              <circle key={i} cx={t.x} cy={t.y} r={2.2} fill="#f2efe9" opacity={t.o} />
            ),
          )}
        </svg>
        <span className="lp-matrix-tag" style={{ left: `${((GRID * PITCH + PAGE_GAP + 14 * PITCH) / MATRIX_W) * 100}%`, top: "37%" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3Z" fill="#0099ff" />
          </svg>
          <b>PAGE 2 · TILE 6,9</b> MASKED
        </span>
      </div>
      <div className="lp-wrap-wide lp-portal-inner">
        <div className="lp-portal-head">
          <span className="lp-eyebrow">
            <span className="lp-eyebrow-icon">
              <LpIcon name="scale" size={14} />
            </span>
            Court Verification Portal
          </span>
          <h2 id="lp-portal" className="lp-h2">
            Every proof checks
            <br />
            out on its own
          </h2>
          <Link href="/verify" className="lp-btn lp-btn-dark">
            Open the portal <Arrow />
          </Link>
        </div>
        <div className="lp-portal-stats">
          <div>
            <small>Tiles per page</small>
            <b>400</b>
          </div>
          <div>
            <small>Anchors per version</small>
            <b>2</b>
          </div>
          <div>
            <small>Logins needed</small>
            <b>0</b>
          </div>
        </div>
        <div className="lp-cols4">
          {(
            [
              ["globe", "Public and stateless", "No account, no session and no database behind the check. Open it from any browser."],
              ["layers", "Tile-by-tile proof", "The portal re-tiles the PNG, rehashes all 400 tiles per page and rebuilds the root."],
              ["chain", "Read straight from the chain", "The root comes from the official contract on Polygon Amoy, never from the file."],
              ["eye", "The original stays sealed", "Courts check the redacted version. The unredacted upload never leaves custody."],
            ] as [LpIconName, string, string][]
          ).map(([icon, t, b]) => (
            <div key={t} className="lp-col">
              <LpIcon name={icon} size={18} className="lp-col-icon" />
              <h3>{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Two files in: code + response ---------- */

type Tok = [string, "k" | "s" | "n" | "p" | "c"];
const PROOF: Tok[][] = [
  [["{", "p"]],
  [['  "digivault_proof_version"', "k"], [": ", "p"], ["1", "n"], [",", "p"]],
  [['  "document_version_id"', "k"], [": ", "p"], ['"ckver790"', "s"], [",", "p"]],
  [['  "grid_size"', "k"], [": ", "p"], ["20", "n"], [",", "p"]],
  [['  "page_count"', "k"], [": ", "p"], ["5", "n"], [",", "p"]],
  [['  "merkle_root"', "k"], [": ", "p"], ['"51aa…9902"', "s"], [",", "p"]],
  [['  "tiles"', "k"], [": ", "p"], ["[", "p"], ["  // 2,000 tile hashes", "c"]],
  [['    "e3b0…b855"', "s"], [", ", "p"], ['"9f86…0f00"', "s"], [", …", "p"]],
  [["  ],", "p"]],
  [['  "anchor"', "k"], [": ", "p"], ["{", "p"]],
  [['    "polygon_chain_id"', "k"], [": ", "p"], ["80002", "n"], [",", "p"]],
  [['    "polygon_tx_hash"', "k"], [": ", "p"], ['"0x7f3c…"', "s"], [",", "p"]],
  [['    "anchored_at"', "k"], [": ", "p"], ['"2026-09-15T10:24:02Z"', "s"]],
  [["  }", "p"]],
  [["}", "p"]],
];

const CHECKS: { t: string; d: string }[] = [
  { t: "Proof file is well-formed", d: "Version 1, 20 × 20 grid, 5 pages" },
  { t: "Every tile hash matches", d: "Re-tiled from the PNG pixels in this browser" },
  { t: "Recomputed root equals the proof", d: "Merkle tree rebuilt from scratch" },
  { t: "RPC reports chain 80002", d: "Polygon Amoy" },
  { t: "On-chain root matches", d: "Read from the official contract" },
];

function TwoFiles() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <section className="lp-section" aria-labelledby="lp-two">
      <div className="lp-wrap-wide">
        <h2 id="lp-two" className="lp-h2">
          Two files in.
          <br />
          One answer out.
        </h2>
        <p className="lp-sub">
          Drop a page PNG and its proof file into the portal. It rebuilds the Merkle tree in your browser and reads the root from Polygon. It
          never asks DigiVault.
        </p>
        <div className="lp-actions">
          <Link href="/verify" className="lp-btn lp-btn-dark">
            Open the portal <Arrow />
          </Link>
          <a href="#custody" className="lp-btn lp-btn-outline">
            See the custody chain
          </a>
        </div>
        <div ref={ref} className={`lp-dev ${seen ? "lp-dev-on" : ""}`}>
          <div className="lp-editor">
            <div className="lp-editor-tabs">
              <span className="lp-editor-tab lp-editor-tab-on">
                <span className="lp-editor-badge">{"{}"}</span>
                proof.json
              </span>
              <span className="lp-editor-tab">page-2.png</span>
              <span className="lp-editor-run">
                <LpIcon name="shield" size={13} /> Verify
              </span>
            </div>
            <div className="lp-editor-body lp-mono" aria-label="Example verification proof file">
              {PROOF.map((line, i) => (
                <div key={i} className={`lp-code-line ${i === 5 || i === 10 ? "lp-code-line-on" : ""}`}>
                  <span className="lp-code-num">{i + 1}</span>
                  <span>
                    {line.map(([text, kind], j) => (
                      <span key={j} className={`lp-tk-${kind}`}>
                        {text}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="lp-editor-foot lp-mono">
              <span>JSON · UTF-8 · example</span>
              <span>
                <i className="lp-dot-ok" /> amoy.polygonscan · Ln 6, Col 18
              </span>
            </div>
          </div>
          <div className="lp-resp">
            <div className="lp-resp-inner">
              <div className="lp-resp-head">
                Verification
                <span className="lp-resp-live">
                  <i /> In your browser
                </span>
              </div>
              <div className="lp-resp-q">Is page 2 of case 2026/1123 unchanged?</div>
              <ul className="lp-checks">
                {CHECKS.map((c, i) => (
                  <li key={c.t} className="lp-check" style={{ animationDelay: `${300 + i * 380}ms` }}>
                    <span className="lp-check-icon">
                      <LpIcon name="check" size={11} stroke={3} />
                    </span>
                    <span>
                      {c.t}
                      <small>{c.d}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="lp-resp-a" style={{ animationDelay: `${300 + CHECKS.length * 380}ms` }}>
                Example result: the page matches the root anchored on chain 80002.
              </p>
            </div>
            <div className="lp-resp-stats">
              <div>
                <small>Tiles checked</small>
                <b>2,000</b>
              </div>
              <div>
                <small>Chain</small>
                <b>80002</b>
              </div>
              <div>
                <small>Servers asked</small>
                <b>0</b>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-caps">
          {[
            ["Proof file", "", "Every tile hash and the anchor, in JSON."],
            ["Page PNGs", "", "Lossless, decoded and re-tiled locally."],
            ["Chain lookup", "Amoy", "Root read from the official contract."],
            ["BSA certificate", "§63", "Section 63 certificate for the court."],
            ["Share links", "", "Only ever serve the redacted version."],
          ].map(([t, badge, d], i) => (
            <div key={t} className={`lp-cap ${i === 0 ? "lp-cap-on" : ""}`}>
              <p className="lp-cap-title">
                {t} {badge && <span className="lp-badge">{badge}</span>}
              </p>
              <p className="lp-cap-body">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Roles (catalog layout, interactive rail) ---------- */

const ROLES: { name: string; short: string; icon: LpIconName; blurb: string }[] = [
  { name: "Police Officer", short: "PO", icon: "user-check", blurb: "Opens cases, uploads and confirms redactions" },
  { name: "Investigating Officer", short: "IO", icon: "fingerprint", blurb: "Runs the full case workflow" },
  { name: "Court Official", short: "CO", icon: "scale", blurb: "Reads versions and downloads proof" },
  { name: "Forensic Lab", short: "FL", icon: "cpu", blurb: "Reads versions and downloads proof" },
  { name: "Admin", short: "AD", icon: "key", blurb: "Everything, including anchoring retries" },
];

const ACTIONS: { label: string; allowed: boolean[]; stepUp: boolean }[] = [
  { label: "Open cases and upload", allowed: [true, true, false, false, true], stepUp: false },
  { label: "Confirm redactions", allowed: [true, true, false, false, true], stepUp: true },
  { label: "Read versions and anchors", allowed: [true, true, true, true, true], stepUp: false },
  { label: "Download proof and certificate", allowed: [true, true, true, true, true], stepUp: true },
  { label: "Retry anchoring", allowed: [false, true, false, false, true], stepUp: true },
  { label: "Create and revoke share links", allowed: [false, true, false, false, true], stepUp: false },
];

function Roles() {
  const [role, setRole] = useState(1);
  const r = ROLES[role];
  const count = ACTIONS.filter((a) => a.allowed[role]).length;
  return (
    <section id="roles" className="lp-section" aria-labelledby="lp-roles">
      <div className="lp-wrap-wide lp-roles">
        <div className="lp-roles-left">
          <span className="lp-eyebrow">
            <span className="lp-eyebrow-icon">
              <LpIcon name="lock" size={14} />
            </span>
            Access control
          </span>
          <h2 id="lp-roles" className="lp-h2">
            Five roles, one
            <br />
            audit trail
          </h2>
          <p className="lp-sub">Every request is checked by the server against the caller&apos;s role. The sensitive ones also need a fingerprint or PIN.</p>
          <div className="lp-actions">
            <Link href="/login" className="lp-btn lp-btn-dark">
              Sign in <Arrow />
            </Link>
            <Link href="/verify" className="lp-btn lp-btn-outline">
              Verify a document
            </Link>
          </div>
          <div className="lp-rule" />
          <ul className="lp-feats">
            {(
              [
                ["fingerprint", "Fingerprint or PIN step-up"],
                ["server", "Checked on every request"],
                ["link", "Redacted-only share links"],
                ["list", "Every view is logged"],
                ["layers", "Versions are never overwritten"],
                ["globe", "Verification needs no login"],
              ] as [LpIconName, string][]
            ).map(([icon, t]) => (
              <li key={t}>
                <LpIcon name={icon} size={16} /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-rolepanel">
          <div className="lp-rail" role="tablist" aria-label="Roles" aria-orientation="vertical">
            {ROLES.map((x, i) => (
              <button
                key={x.name}
                type="button"
                role="tab"
                aria-selected={i === role}
                aria-label={x.name}
                title={x.name}
                className={`lp-rail-btn ${i === role ? "lp-rail-on" : ""}`}
                onClick={() => setRole(i)}
              >
                <LpIcon name={x.icon} size={18} />
              </button>
            ))}
          </div>
          <div className="lp-rolebody" role="tabpanel" aria-label={r.name}>
            <div className="lp-rolechips">
              <span className="lp-rolechip lp-rolechip-on">
                <LpIcon name={r.icon} size={13} /> {r.name}
              </span>
              <span className="lp-rolechip">server-enforced</span>
              <span className="lp-rolechip">step-up</span>
              <span className="lp-rolechip-more">+ audit log</span>
            </div>
            <div className="lp-rolemsg">
              <span className="lp-roleavatar">{r.short}</span>
              <span>
                <b>{r.name}</b>
                <span className="lp-rolebubble">What can this role do?</span>
              </span>
            </div>
            <div className="lp-rolereply">
              <p className="lp-rolereply-who">
                <BrandMark size={14} /> DigiVault
              </p>
              <p className="lp-roletrace">
                <LpIcon name="check" size={12} stroke={2.4} /> Read the role from the signed session
              </p>
              <p className="lp-roletrace">
                <LpIcon name="check" size={12} stroke={2.4} /> Checked {ACTIONS.length} protected actions
              </p>
              <p className="lp-rolelead">
                {r.blurb}. {count} of {ACTIONS.length} actions allowed:
              </p>
            </div>
            <p className="lp-roletable-h">Permissions</p>
            <div className="lp-roletable-wrap">
              <table className="lp-roletable">
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Access</th>
                    <th scope="col">Step-up</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTIONS.map((a) => (
                    <tr key={a.label} className={a.allowed[role] ? undefined : "lp-row-off"}>
                      <th scope="row">{a.label}</th>
                      <td>{a.allowed[role] ? "Allowed" : "No access"}</td>
                      <td>{a.allowed[role] && a.stepUp ? "Required" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA + footer ---------- */

function Cta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="lp-wrap-wide lp-cta-wrap" aria-labelledby="lp-cta">
      <div className="lp-cta">
        <TileField className="lp-fill lp-tf-cta" seed={29} density={0.08} accents={5} pulses={6} />
        <div className="lp-cta-brand">
          <BrandMark size={26} /> DigiVault
        </div>
        <div className="lp-cta-row">
          <h2 id="lp-cta" className="lp-cta-h">
            Ready to seal your
            <br />
            first case file?
          </h2>
          <div className="lp-cta-actions">
            <Link href={signedIn ? "/dashboard" : "/login"} className="lp-btn lp-btn-light">
              {signedIn ? "Open dashboard" : "Sign in"} <Arrow />
            </Link>
            <Link href="/verify" className="lp-btn lp-btn-dark">
              Verify a document
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap-wide">
        <div className="lp-footer-grid">
          <div>
            <Link href="/" className="lp-brand">
              <BrandMark size={22} /> DigiVault
            </Link>
            <p className="lp-footer-tag">Tamper-evident evidence for the NCRB Women Safety Division.</p>
          </div>
          <div>
            <p className="lp-footer-h">Product</p>
            <Link href="/login" className="lp-fi">Sign in</Link>
            <a href="#how" className="lp-fi">How it works</a>
            <a href="#custody" className="lp-fi">Chain of custody</a>
            <a href="#roles" className="lp-fi">Roles</a>
          </div>
          <div>
            <p className="lp-footer-h">Verification</p>
            <Link href="/verify" className="lp-fi">Court portal</Link>
            <a href="#portal" className="lp-fi">How checks work</a>
            <span className="lp-fi">BSA §63 certificate</span>
          </div>
          <div>
            <p className="lp-footer-h">Project</p>
            <span className="lp-fi">NCRB, Women Safety</span>
            <span className="lp-fi">Smart India Hackathon</span>
            <span className="lp-fi">Polygon Amoy testnet</span>
          </div>
        </div>
        <div className="lp-footer-bar">
          <span className="lp-footer-status">
            <i className="lp-dot-ok" /> Anchoring on Polygon Amoy, chain 80002
          </span>
          <span>© 2026 DigiVault</span>
        </div>
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
        <Features />
        <CustodyGraph />
        <Portal />
        <TwoFiles />
        <Roles />
        <Cta signedIn={signedIn} />
      </main>
      <Footer />
    </div>
  );
}
