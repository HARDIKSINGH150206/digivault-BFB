"use client";

const AXES = ["Hash Integrity", "Chain Continuity", "Redaction Coverage", "Blockchain Anchor", "AI Confidence"] as const;

const SIZE = 400;
const CENTER = SIZE / 2;
const MAX_RADIUS = 92;
const LABEL_RADIUS_FRACTION = 1.32;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointFor(axisIndex: number, fraction: number): [number, number] {
  const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / AXES.length;
  return [CENTER + MAX_RADIUS * fraction * Math.cos(angle), CENTER + MAX_RADIUS * fraction * Math.sin(angle)];
}

function polygonPoints(fractions: number[]): string {
  return fractions.map((f, i) => pointFor(i, f).join(",")).join(" ");
}

function labelAnchor(axisIndex: number): { textAnchor: "start" | "middle" | "end"; dy: number } {
  const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / AXES.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const textAnchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
  const dy = sin > 0.3 ? 12 : sin < -0.3 ? -4 : 4;
  return { textAnchor, dy };
}

export interface IntegrityRadarProps {
  hashIntegrity: number;
  chainContinuity: number;
  redactionCoverage: number;
  blockchainAnchor: number;
  aiConfidence: number;
}

export function IntegrityRadar(props: IntegrityRadarProps) {
  const scores = [
    props.hashIntegrity,
    props.chainContinuity,
    props.redactionCoverage,
    props.blockchainAnchor,
    props.aiConfidence,
  ];
  const dataFractions = scores.map((s) => Math.max(0, Math.min(100, s)) / 100);

  return (
    <section
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
        border: "1px solid #1f2937",
        borderRadius: 8,
        padding: 24,
        boxShadow: "0 0 0 1px rgba(74,144,196,0.05), 0 0 40px rgba(30,80,160,0.14)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, color: "#f9fafb" }}>Document Security Profile</h2>
      <div style={{ marginTop: 8 }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          style={{ display: "block" }}
          role="img"
          aria-label="Document security profile radar chart"
        >
          {RINGS.map((r) => (
            <polygon
              key={r}
              points={polygonPoints(AXES.map(() => r))}
              fill="none"
              stroke="#374151"
              strokeWidth={1}
            />
          ))}

          {AXES.map((_, i) => {
            const [x, y] = pointFor(i, 1);
            return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#4b5563" strokeWidth={1} />;
          })}

          <polygon
            points={polygonPoints(dataFractions)}
            fill="rgba(59,130,246,0.2)"
            stroke="#3b82f6"
            strokeWidth={2}
          />

          {dataFractions.map((f, i) => {
            const [x, y] = pointFor(i, f);
            return <circle key={i} cx={x} cy={y} r={4} fill="#3b82f6" />;
          })}

          {dataFractions.map((f, i) => {
            // Deliberately NOT offset toward the axis label (which sits further
            // out along the same ray) — on the two near-horizontal axes that
            // collided the score digits into the label text. Centering the
            // score directly above its dot keeps it clear of the label in
            // every direction instead.
            const [x, y] = pointFor(i, Math.max(f, 0.12));
            return (
              <text
                key={i}
                x={x}
                y={y - 11}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="#93c5fd"
                fontFamily="monospace"
              >
                {Math.round(scores[i])}
              </text>
            );
          })}

          {AXES.map((label, i) => {
            const [x, y] = pointFor(i, LABEL_RADIUS_FRACTION);
            const { textAnchor, dy } = labelAnchor(i);
            return (
              <text
                key={label}
                x={x}
                y={y + dy}
                textAnchor={textAnchor}
                fontSize={10.5}
                fill="#9ca3af"
                fontWeight={600}
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        {AXES.map((label, i) => (
          <div key={label} style={{ minWidth: 0, flex: "1 1 0" }}>
            <div style={{ color: "#9ca3af", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div style={{ width: 80, maxWidth: "100%", height: 5, background: "#0a0f1a", borderRadius: 999, overflow: "hidden", border: "1px solid #1f2937" }}>
                <div style={{ width: `${Math.max(0, Math.min(100, scores[i]))}%`, height: "100%", background: "#3b82f6" }} />
              </div>
              <span style={{ color: "#93c5fd", fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{Math.round(scores[i])}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
