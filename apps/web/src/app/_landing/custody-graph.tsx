"use client";

/**
 * Interactive chain-of-custody graph. Four inputs feed one evidence
 * version; once all four are wired the version seals and five outputs come
 * alive, with the court portal fed by both anchors. An AI card feeds only
 * the officer, never the version, which is the point of rule 2.
 *
 * Desktop: a fixed 1520 x 560 canvas scaled to fit, draggable cards, and
 * ports you drag (or click) to connect. Below 768px: a stacked list.
 * Illustration only, no API calls.
 */

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from "react";
import Link from "next/link";
import { LpIcon, type LpIconName } from "./icons";

const CW = 1520;
const CH = 560;
const CARD_W = 232;
const CARD_H = 144;
const HUB_W = 256;
const HUB_H = 346;
const PORT_Y = 114;
const ROW_Y0 = 84;
const ROW_H = 56;
const BRAND = "#0099ff";

type Pt = { x: number; y: number };
type CardId = "file" | "hash" | "server" | "officer" | "ai" | "hub" | "minio" | "polygon" | "court" | "audit" | "share";

type InputDef = {
  id: CardId;
  row: number;
  title: string;
  icon: LpIconName;
  port: string;
  color: string;
  hubLabel: string;
  lines?: [string, string];
  chips?: string[];
  note?: string;
};

const INPUTS: InputDef[] = [
  { id: "file", row: 0, title: "Case file", icon: "file", port: "pages", color: "#f0b24a", hubLabel: "Page images", lines: ["FIR_2026_1123.pdf", "6 pages · scanned 300 dpi"] },
  { id: "hash", row: 1, title: "Browser hash", icon: "fingerprint", port: "root", color: "#ef7a45", hubLabel: "Merkle root", lines: ["20 × 20 tiles per page", "SHA-256 on raw pixels"] },
  { id: "server", row: 2, title: "Server re-check", icon: "server", port: "match", color: "#e8578f", hubLabel: "Server match", chips: ["recompute", "compare", "409 on mismatch"] },
  { id: "officer", row: 3, title: "Officer sign-off", icon: "user-check", port: "consent", color: "#9b87f5", hubLabel: "Officer sign-off", note: "Mask 3 tiles on page 2. Confirmed with PIN step-up." },
];

type OutputDef = { id: CardId; title: string; icon: LpIconName; lines: [string, string]; wait: string; live: string; hubRow?: number };

const OUTPUTS: OutputDef[] = [
  { id: "minio", hubRow: 0, title: "MinIO Object Lock", icon: "database", lines: ["evidence/2026-1123/v2", "Compliance mode · WORM"], wait: "Waiting for seal", live: "Root locked" },
  { id: "polygon", hubRow: 1, title: "Polygon Amoy", icon: "chain", lines: ["EvidenceAnchor.sol", "Chain 80002"], wait: "Waiting for seal", live: "Root anchored" },
  { id: "audit", hubRow: 2, title: "Audit log", icon: "list", lines: ["Append-only", "Every view and download"], wait: "Waiting for seal", live: "Recording" },
  { id: "share", hubRow: 3, title: "Share link", icon: "link", lines: ["Redacted version only", "Expires, revocable, view cap"], wait: "Waiting for seal", live: "Link ready" },
  { id: "court", title: "Court portal", icon: "scale", lines: ["/verify · public", "No login, no database"], wait: "Waiting for anchors", live: "Anyone can verify" },
];

const START: Record<CardId, Pt> = {
  file: { x: 300, y: 32 },
  hash: { x: 40, y: 208 },
  server: { x: 340, y: 208 },
  officer: { x: 340, y: 384 },
  ai: { x: 40, y: 384 },
  hub: { x: 632, y: 110 },
  minio: { x: 988, y: 32 },
  polygon: { x: 948, y: 208 },
  court: { x: 1248, y: 208 },
  audit: { x: 968, y: 384 },
  share: { x: 1248, y: 384 },
};

const INITIAL = [true, false, false, false];

function wirePath(a: Pt, b: Pt, sag: number): string {
  const k = Math.max(60, (b.x - a.x) / 2);
  const f = (n: number) => n.toFixed(1);
  return `M ${f(a.x)} ${f(a.y)} C ${f(a.x + k)} ${f(a.y + sag)}, ${f(b.x - k)} ${f(b.y + sag)}, ${f(b.x)} ${f(b.y)}`;
}

function LiveWire({ a, b, color, flow = true }: { a: Pt; b: Pt; color: string; flow?: boolean }) {
  const d = wirePath(a, b, 0.12 * Math.hypot(b.x - a.x, b.y - a.y));
  return (
    <g>
      <path d={d} stroke={color} strokeWidth={7} opacity={0.45} fill="none" filter="url(#lp-g-glow)" pathLength={1} className="lp-g-draw" />
      <path d={d} stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" pathLength={1} className="lp-g-draw" />
      {flow && <path d={d} stroke="white" strokeOpacity={0.75} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 14" fill="none" className="lp-g-flow" />}
    </g>
  );
}

function IdleWire({ a, b, dash = "3 6", opacity = 0.12 }: { a: Pt; b: Pt; dash?: string; opacity?: number }) {
  return <path d={wirePath(a, b, 0)} stroke="white" strokeOpacity={opacity} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" fill="none" />;
}

function Dot({ p, color, label, onPointerDown, onClick, tabIndex, pressed, target, muted }: {
  p: Pt;
  color?: string;
  label?: string;
  onPointerDown?: (e: RPointerEvent<HTMLButtonElement>) => void;
  onClick?: () => void;
  tabIndex?: number;
  pressed?: boolean;
  target?: boolean;
  muted?: boolean;
}) {
  const style = color ? { backgroundColor: color, boxShadow: `0 0 0 3px var(--ink-2), 0 0 12px 1px ${color}` } : undefined;
  const dot = <span className={`lp-g-dot ${muted ? "lp-g-dot-muted" : ""} ${target ? "lp-g-dot-target" : ""}`} style={style} />;
  const pos = { left: p.x - 14, top: p.y - 14 };
  if (!label) {
    return (
      <span aria-hidden="true" className="lp-g-port" style={pos}>
        {dot}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      tabIndex={tabIndex}
      className={`lp-g-port lp-g-port-btn ${onPointerDown ? "lp-g-port-grab" : ""}`}
      style={pos}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {dot}
    </button>
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

export function CustodyGraph() {
  const reduced = usePrefersReducedMotion();
  const [connected, setConnected] = useState<boolean[]>(INITIAL);
  const [pos, setPos] = useState<Record<CardId, Pt>>(START);
  const [live, setLive] = useState(0);
  const [drag, setDrag] = useState<{ row: number; end: Pt } | null>(null);
  const [flash, setFlash] = useState<{ color: string; key: number } | null>(null);
  const [scale, setScale] = useState(1392 / CW);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const dragged = useRef(false);

  const count = connected.filter(Boolean).length;
  const sealed = count === 4;
  const pristine = connected.every((c, i) => c === INITIAL[i]) && (Object.keys(START) as CardId[]).every((k) => pos[k].x === START[k].x && pos[k].y === START[k].y);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / CW);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Outputs come alive one after another once the version seals.
  useEffect(() => {
    if (!sealed) {
      setLive(0);
      return;
    }
    if (reduced) {
      setLive(OUTPUTS.length);
      return;
    }
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setLive(n);
      if (n >= OUTPUTS.length) window.clearInterval(id);
    }, 170);
    return () => window.clearInterval(id);
  }, [sealed, reduced]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const outPort = (id: CardId): Pt => ({ x: pos[id].x + CARD_W, y: pos[id].y + PORT_Y });
  const inPort = (id: CardId): Pt => ({ x: pos[id].x, y: pos[id].y + PORT_Y });
  const hubIn = (row: number): Pt => ({ x: pos.hub.x, y: pos.hub.y + ROW_Y0 + ROW_H * row });
  const hubOut = (row: number): Pt => ({ x: pos.hub.x + HUB_W, y: pos.hub.y + ROW_Y0 + ROW_H * row });

  function setRow(row: number, on: boolean) {
    setConnected((c) => c.map((v, i) => (i === row ? on : v)));
    if (on) setFlash({ color: INPUTS[row].color, key: Date.now() + row });
  }

  function connectAll() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const todo = INPUTS.filter((d) => !connected[d.row]);
    todo.forEach((d, i) => {
      timers.current.push(window.setTimeout(() => setRow(d.row, true), reduced ? 0 : i * 220));
    });
  }

  function reset() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setConnected(INITIAL);
    setPos(START);
    setFlash(null);
  }

  function toCanvas(e: { clientX: number; clientY: number }): Pt {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  /* Wire drag from an input's port to the hub. A press without movement falls through to onClick, which toggles. */
  function startWire(row: number, e: RPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      setDrag({ row, end: toCanvas(ev) });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moved) return;
      dragged.current = true;
      const end = toCanvas(ev);
      const t = hubIn(row);
      if (Math.hypot(end.x - t.x, end.y - t.y) < 40) setRow(row, true);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /* Card drag by its header. */
  function startCard(id: CardId, e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    const start = pos[id];
    const w = id === "hub" ? HUB_W : CARD_W;
    const h = id === "hub" ? HUB_H : CARD_H;
    const move = (ev: PointerEvent) => {
      const x = Math.min(CW - w, Math.max(0, start.x + (ev.clientX - sx) / scale));
      const y = Math.min(CH - h, Math.max(0, start.y + (ev.clientY - sy) / scale));
      setPos((p) => ({ ...p, [id]: { x, y } }));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function keyMove(id: CardId, e: RKeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 32 : 8;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const w = id === "hub" ? HUB_W : CARD_W;
    const h = id === "hub" ? HUB_H : CARD_H;
    setPos((p) => ({
      ...p,
      [id]: { x: Math.min(CW - w, Math.max(0, p[id].x + d[0])), y: Math.min(CH - h, Math.max(0, p[id].y + d[1])) },
    }));
  }

  // A render helper, not a component: a component declared in here would be a
  // new type every render and React would remount the header mid-drag.
  function cardHead(id: CardId, icon: LpIconName, title: string, extra?: React.ReactNode) {
    return (
      <div className={id === "hub" ? "lp-g-head lp-g-head-hub" : "lp-g-head"} onPointerDown={(e) => startCard(id, e)}>
        <LpIcon name={icon} size={16} className="lp-g-head-icon" />
        <p>{title}</p>
        {extra}
        <button type="button" aria-label={`Move the ${title} card with the arrow keys`} className="lp-g-grip" onKeyDown={(e) => keyMove(id, e)}>
          <LpIcon name="grip" size={14} stroke={2} />
        </button>
      </div>
    );
  }

  const outLive = (i: number) => live > i;
  const courtLive = live >= OUTPUTS.length;

  return (
    <section id="custody" className="lp-g-section" aria-labelledby="lp-custody">
      <div className="lp-wrap">
        <div className="lp-g-intro">
          <div>
            <h2 id="lp-custody" className="lp-h2 lp-h2-tight">
              Wire up a chain of custody in a minute
            </h2>
            <p className="lp-sub">
              Connect the case file, the browser hash, the server check and the officer&apos;s sign-off. DigiVault seals the version and anchors
              it twice.
            </p>
          </div>
          <div className="lp-g-controls">
            <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={reset} disabled={pristine}>
              Reset
            </button>
            <button type="button" className="lp-btn lp-btn-outline lp-btn-sm" onClick={connectAll} disabled={sealed}>
              Connect all
            </button>
          </div>
        </div>
      </div>

      {/* Phone and small tablet: stacked list */}
      <div className="lp-g-mobile">
        <ul role="list" className="lp-g-mlist">
          {INPUTS.map((d) => (
            <li key={d.id}>
              <button type="button" aria-pressed={connected[d.row]} className="lp-g-mitem" onClick={() => setRow(d.row, !connected[d.row])}>
                <span className="lp-g-micon">
                  <LpIcon name={d.icon} size={20} />
                </span>
                <span className="lp-g-mtext">
                  <b>{d.title}</b>
                  <span>{d.hubLabel}</span>
                </span>
                <span className={`lp-g-mstate ${connected[d.row] ? "lp-g-mstate-on" : ""}`}>
                  <span className="lp-g-mdot" style={connected[d.row] ? { backgroundColor: d.color, boxShadow: `0 0 8px ${d.color}` } : undefined} />
                  {connected[d.row] ? "Connected" : "Connect"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div aria-hidden="true" className="lp-g-mline-wrap">
          <span className={`lp-g-mline ${sealed ? "lp-g-mline-on" : ""}`} />
        </div>
        <div className={`lp-g-mhub ${sealed ? "lp-g-hub-sealed" : ""}`}>
          <div className="lp-g-mhub-head">
            <LpIcon name="seal" size={16} /> <b>Evidence version</b> <span>v2 · redacted</span>
          </div>
          <ul role="list" className="lp-g-mrows">
            {INPUTS.map((d) => (
              <li key={d.id}>
                <span className="lp-g-mdot" style={{ backgroundColor: connected[d.row] ? d.color : "rgba(255,255,255,0.2)" }} />
                <span className={connected[d.row] ? "lp-g-row-on" : "lp-g-row-off"}>{d.hubLabel}</span>
              </li>
            ))}
          </ul>
          <div className="lp-g-mhub-foot">
            <span className="lp-g-mdot" style={{ backgroundColor: sealed ? BRAND : "rgba(255,255,255,0.25)" }} />
            {sealed ? "Sealed · anchored twice" : `Awaiting inputs · ${count}/4`}
          </div>
        </div>
        <div aria-hidden="true" className="lp-g-mline-wrap">
          <span className={`lp-g-mline ${sealed ? "lp-g-mline-on" : ""}`} />
        </div>
        <ul role="list" className="lp-g-mouts">
          {OUTPUTS.map((o, i) => (
            <li key={o.id} className={outLive(i) ? "lp-g-mout lp-g-mout-on" : "lp-g-mout"}>
              <LpIcon name={o.icon} size={18} />
              <p className="lp-g-mout-title">{o.title}</p>
              <p className="lp-g-mout-state">
                <span className="lp-g-mdot" style={outLive(i) ? { backgroundColor: BRAND, boxShadow: `0 0 6px ${BRAND}` } : undefined} />
                {outLive(i) ? o.live : "Waiting"}
              </p>
            </li>
          ))}
        </ul>
        <p className="lp-g-mnote">
          <LpIcon name="sparkles" size={14} /> AI suggestions reach the officer, never the hash.
        </p>
      </div>

      {/* Desktop canvas */}
      <div className="lp-g-desk">
        <div aria-hidden="true" className="lp-g-bg">
          <div className="lp-g-bg-grid" style={{ top: 16 * scale, height: 528 * scale }} />
          {[16, 192, 368, 544].map((y) => (
            <span key={y} className="lp-g-bg-line" style={{ top: y * scale }} />
          ))}
        </div>
        <div ref={stageRef} className="lp-g-stage" style={{ height: CH * scale }}>
          <div ref={canvasRef} className="lp-g-canvas" style={{ width: CW, height: CH, transform: `scale(${scale})` }}>
            <svg width={CW} height={CH} className="lp-g-wires" aria-hidden="true">
              <defs>
                <filter id="lp-g-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" />
                </filter>
              </defs>
              {/* AI only ever points at the officer, never at the version */}
              <IdleWire a={outPort("ai")} b={inPort("officer")} dash="2 5" opacity={0.3} />
              {INPUTS.map((d) => (connected[d.row] ? <LiveWire key={d.id} a={outPort(d.id)} b={hubIn(d.row)} color={d.color} flow={!reduced} /> : null))}
              {OUTPUTS.map((o, i) =>
                o.hubRow === undefined ? null : outLive(i) ? (
                  <LiveWire key={o.id} a={hubOut(o.hubRow)} b={inPort(o.id)} color={BRAND} flow={!reduced} />
                ) : (
                  <IdleWire key={o.id} a={hubOut(o.hubRow)} b={inPort(o.id)} />
                ),
              )}
              {(["minio", "polygon"] as CardId[]).map((src) =>
                courtLive ? (
                  <LiveWire key={src} a={outPort(src)} b={inPort("court")} color={BRAND} flow={!reduced} />
                ) : (
                  <IdleWire key={src} a={outPort(src)} b={inPort("court")} />
                ),
              )}
              {drag && (
                <path
                  d={wirePath(outPort(INPUTS[drag.row].id), drag.end, 0)}
                  stroke={INPUTS[drag.row].color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </svg>

            {/* Input cards */}
            {INPUTS.map((d) => (
              <div key={d.id} className="lp-g-card" style={{ left: pos[d.id].x, top: pos[d.id].y }}>
                {cardHead(d.id, d.icon, d.title)}
                <div className="lp-g-body">
                  {d.lines && (
                    <div className="lp-g-lines">
                      <p className="lp-g-l1">{d.lines[0]}</p>
                      <p className="lp-g-l2">{d.lines[1]}</p>
                    </div>
                  )}
                  {d.chips && (
                    <div className="lp-g-chips">
                      {d.chips.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                  )}
                  {d.note && <p className="lp-g-note">{d.note}</p>}
                </div>
                <div className="lp-g-foot lp-g-foot-end">{d.port}</div>
              </div>
            ))}

            {/* AI suggestions: advisory only */}
            <div className="lp-g-card lp-g-card-ai" style={{ left: pos.ai.x, top: pos.ai.y }}>
              {cardHead("ai", "sparkles", "AI suggestions", <span className="lp-g-tag">advisory</span>)}
              <div className="lp-g-body">
                <div className="lp-g-lines">
                  <p className="lp-g-l1">IndicNER · Bhashini OCR</p>
                  <p className="lp-g-l2">Points at tiles, never hashes</p>
                </div>
              </div>
              <div className="lp-g-foot lp-g-foot-end">suggests</div>
            </div>

            {/* Hub */}
            <div className={`lp-g-hub ${sealed ? "lp-g-hub-sealed" : ""}`} style={{ left: pos.hub.x, top: pos.hub.y }}>
              {sealed && (
                <div aria-hidden="true" className="lp-g-hub-glow">
                  <span className="lp-g-hub-line" />
                  <span className="lp-g-hub-blob" />
                </div>
              )}
              <div className="lp-g-hub-inner">
                {cardHead("hub", "seal", "Evidence", <span className="lp-g-hub-sub">v2 · redacted</span>)}
                <div className="lp-g-hub-list">
                  {flash && !reduced && <span key={flash.key} aria-hidden="true" className="lp-g-flash" style={{ ["--c" as string]: flash.color }} />}
                  <ul>
                    {INPUTS.map((d) => (
                      <li key={d.id}>
                        <span className={connected[d.row] ? "lp-g-row-on" : "lp-g-row-off"}>{d.hubLabel}</span>
                        {connected[d.row] && (
                          <span className="lp-g-check" style={{ color: d.color }}>
                            <LpIcon name="check" size={16} stroke={2.5} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lp-g-hub-foot">
                  <span className="lp-g-sdot" style={{ backgroundColor: sealed ? BRAND : "rgba(242,239,233,0.3)" }} />
                  <span key={sealed ? "s" : count} className="lp-g-status">
                    {sealed ? (courtLive ? "Sealed · anchored twice" : "Sealed · anchoring") : `Awaiting inputs · ${count}/4`}
                  </span>
                  {sealed && (
                    <Link href="/verify" className="lp-g-verify">
                      Verify
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Output cards */}
            {OUTPUTS.map((o, i) => {
              const on = o.id === "court" ? courtLive : outLive(i);
              return (
                <div key={o.id} className={`lp-g-card ${on ? "" : "lp-g-card-dim"}`} style={{ left: pos[o.id].x, top: pos[o.id].y }}>
                  {cardHead(o.id, o.icon, o.title)}
                  <div className="lp-g-body">
                    <div className="lp-g-lines">
                      <p className="lp-g-l1">{o.lines[0]}</p>
                      <p className="lp-g-l2">{o.lines[1]}</p>
                    </div>
                  </div>
                  <div className="lp-g-foot lp-g-foot-start">
                    <span className="lp-g-sdot" style={on ? { backgroundColor: BRAND, boxShadow: `0 0 6px ${BRAND}` } : undefined} />
                    {on ? o.live : o.wait}
                  </div>
                </div>
              );
            })}

            {/* Ports */}
            <Dot p={outPort("ai")} muted />
            <Dot p={inPort("officer")} muted />
            {OUTPUTS.map((o, i) => {
              const on = o.id === "court" ? courtLive : outLive(i);
              return <Dot key={o.id} p={inPort(o.id)} color={on ? BRAND : undefined} />;
            })}
            <Dot p={outPort("minio")} color={courtLive ? BRAND : undefined} />
            <Dot p={outPort("polygon")} color={courtLive ? BRAND : undefined} />
            {[0, 1, 2, 3].map((r) => (
              <Dot key={r} p={hubOut(r)} color={outLive(r) ? BRAND : undefined} />
            ))}
            {INPUTS.map((d) => (
              <Dot
                key={d.id}
                p={outPort(d.id)}
                color={connected[d.row] || drag?.row === d.row ? d.color : undefined}
                label={connected[d.row] ? `${d.hubLabel} connected. Activate to disconnect` : `Connect ${d.hubLabel}`}
                pressed={connected[d.row]}
                onPointerDown={(e) => startWire(d.row, e)}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  setRow(d.row, !connected[d.row]);
                }}
              />
            ))}
            {INPUTS.map((d) => (
              <Dot
                key={`in-${d.id}`}
                p={hubIn(d.row)}
                color={connected[d.row] ? d.color : undefined}
                target={drag?.row === d.row}
                label={connected[d.row] ? `${d.hubLabel} connected. Activate to disconnect` : `${d.hubLabel} input`}
                tabIndex={connected[d.row] ? 0 : -1}
                onClick={() => connected[d.row] && setRow(d.row, false)}
              />
            ))}
          </div>
        </div>
      </div>
      <p aria-live="polite" className="lp-sr">
        Drag from a dot to the matching input. {count} of 4 connected.{sealed ? " Version sealed and anchored." : ""}
      </p>
    </section>
  );
}
