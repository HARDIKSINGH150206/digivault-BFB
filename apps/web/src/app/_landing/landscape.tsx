/**
 * Misty mountain range drawn in SVG: sky, five ridge layers whose tops fade
 * towards snow, fog bands between them and a sunlit meadow in front.
 * Geometry comes from a seeded generator, so server and client render the
 * same path data (no hydration mismatch) and nothing is fetched.
 */

const W = 1600;
const H = 900;

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

/** Ridge outline: a few broad peaks plus jagged detail, closed to the bottom. */
function ridge(seed: number, base: number, amp: number, peaks: number, jag: number): string {
  const r = rng(seed);
  const centres = Array.from({ length: peaks }, () => ({ x: r() * W, h: 0.45 + r() * 0.55, w: 90 + r() * 190 }));
  const pts: string[] = [];
  let noise = 0;
  for (let x = -20; x <= W + 20; x += 6) {
    let y = 0;
    for (const c of centres) {
      const d = Math.abs(x - c.x) / c.w;
      y = Math.max(y, c.h * Math.max(0, 1 - d * d * 0.9 - d * 0.25));
    }
    noise = noise * 0.72 + (r() - 0.5) * jag;
    pts.push(`${x},${(base - y * amp + noise).toFixed(1)}`);
  }
  return `M-20,${H} L${pts.join(" L")} L${W + 20},${H} Z`;
}

type Layer = { seed: number; base: number; amp: number; peaks: number; jag: number; top: string; bottom: string };

const LAYERS: Layer[] = [
  { seed: 11, base: 470, amp: 300, peaks: 7, jag: 7, top: "#f4f7fb", bottom: "#9db6cf" },
  { seed: 23, base: 560, amp: 230, peaks: 8, jag: 9, top: "#dfe8f2", bottom: "#7f9dbc" },
  { seed: 37, base: 640, amp: 170, peaks: 9, jag: 10, top: "#a9c0d8", bottom: "#5f7f9f" },
  { seed: 41, base: 720, amp: 130, peaks: 10, jag: 12, top: "#6f8eaf", bottom: "#3f5f80" },
  { seed: 53, base: 800, amp: 90, peaks: 11, jag: 14, top: "#46658a", bottom: "#24405e" },
];

const PATHS = LAYERS.map((l) => ridge(l.seed, l.base, l.amp, l.peaks, l.jag));

export function Landscape({ id, className, meadow = true, layers = LAYERS.length }: { id: string; className?: string; meadow?: boolean; layers?: number }) {
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fa8d1" />
          <stop offset="0.55" stopColor="#b9d0e6" />
          <stop offset="1" stopColor="#e6eef6" />
        </linearGradient>
        {LAYERS.map((l, i) => (
          <linearGradient key={i} id={`${id}-r${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.25" stopColor={l.top} />
            <stop offset="0.62" stopColor={l.bottom} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f3f7fb" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-meadow`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9c24a" />
          <stop offset="0.45" stopColor="#c6b543" stopOpacity="0.9" />
          <stop offset="1" stopColor="#8fa05a" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {PATHS.slice(0, layers).map((d, i) => (
        <g key={i}>
          <path d={d} fill={`url(#${id}-r${i})`} />
          <rect
            x="-40"
            y={LAYERS[i].base - LAYERS[i].amp * 0.28}
            width={W + 80}
            height={LAYERS[i].amp * 0.5}
            fill={`url(#${id}-fog)`}
            filter={`url(#${id}-blur)`}
            opacity={0.85 - i * 0.08}
          />
        </g>
      ))}
      {meadow && <path d={`M-20,${H} L-20,862 C 300,846 620,858 980,880 L 1100,${H} Z`} fill={`url(#${id}-meadow)`} />}
    </svg>
  );
}
