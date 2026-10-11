/**
 * Minimal backdrop: the tile grid every page is split into before hashing.
 * Hairline cells, a sparse scatter of faintly filled (hashed) tiles, a few
 * accent tiles (blue = verified, near-black = redacted on the light tone)
 * and a handful that pulse slowly. Geometry comes from a seeded generator,
 * so server and client render identical markup.
 */

const CELL = 40;
const COLS = 40;
const ROWS = 22;
const W = CELL * COLS;
const H = CELL * ROWS;

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

type Tile = { x: number; y: number; o: number };

function layout(seed: number, density: number, accents: number, redacted: number, pulses: number) {
  const r = rng(seed);
  const filled: Tile[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (r() < density) filled.push({ x: col * CELL, y: row * CELL, o: 0.35 + r() * 0.65 });
    }
  }
  const pick = (n: number): Tile[] => Array.from({ length: n }, () => ({ x: Math.floor(r() * COLS) * CELL, y: Math.floor(r() * ROWS) * CELL, o: 0.5 + r() * 0.5 }));
  return { filled, accent: pick(accents), redact: pick(redacted), pulse: pick(pulses) };
}

const TONES = {
  dark: { line: "rgba(242,239,233,0.07)", fill: "rgba(242,239,233,0.06)", accent: "#0099ff", redact: "#f2efe9" },
  light: { line: "rgba(10,10,10,0.07)", fill: "rgba(10,10,10,0.045)", accent: "#0099ff", redact: "#1d2226" },
};

export function TileField({
  className,
  tone = "dark",
  seed = 7,
  density = 0.07,
  accents = 5,
  redacted = 0,
  pulses = 8,
}: {
  className?: string;
  tone?: keyof typeof TONES;
  seed?: number;
  density?: number;
  accents?: number;
  redacted?: number;
  pulses?: number;
}) {
  const c = TONES[tone];
  const t = layout(seed, density, accents, redacted, pulses);
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {t.filled.map((p, i) => (
        <rect key={`f${i}`} x={p.x} y={p.y} width={CELL} height={CELL} fill={c.fill} opacity={p.o} />
      ))}
      {t.accent.map((p, i) => (
        <rect key={`a${i}`} x={p.x} y={p.y} width={CELL} height={CELL} fill={c.accent} opacity={p.o * 0.45} />
      ))}
      {t.redact.map((p, i) => (
        <rect key={`r${i}`} x={p.x} y={p.y} width={CELL} height={CELL} fill={c.redact} opacity={tone === "dark" ? 0.12 : 0.85} />
      ))}
      {t.pulse.map((p, i) => (
        <rect key={`p${i}`} className="lp-tf-pulse" style={{ animationDelay: `${(i * 1.7) % 9}s` }} x={p.x} y={p.y} width={CELL} height={CELL} fill={c.accent} />
      ))}
      <g stroke={c.line} strokeWidth="1" shapeRendering="crispEdges" vectorEffect="non-scaling-stroke">
        {Array.from({ length: COLS + 1 }, (_, i) => (
          <line key={`v${i}`} x1={i * CELL} y1="0" x2={i * CELL} y2={H} vectorEffect="non-scaling-stroke" />
        ))}
        {Array.from({ length: ROWS + 1 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * CELL} x2={W} y2={i * CELL} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
