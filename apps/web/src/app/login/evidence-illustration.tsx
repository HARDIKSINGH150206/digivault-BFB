/**
 * Decorative three-step story for the login page: an evidence page, the
 * same page with sensitive areas blacked out, and the same page with a
 * fingerprint grid and a check seal. Purely presentational — no props, no
 * data, no controls, no connection to auth or backend state. The step
 * labels describe the idea (Evidence / Protected / Verifiable), not any
 * real document or event. aria-hidden: the page headline carries the
 * meaning for assistive technology.
 *
 * Motion is one short intro sequence (scan -> redact -> fingerprint ->
 * seal) followed by very slow ambient float. Every element's resting CSS
 * is its FINAL state and keyframes only describe how it arrives there, so
 * with prefers-reduced-motion (all animations disabled) the finished
 * illustration is shown as-is.
 */

type Variant = "original" | "protected" | "verifiable";

const LINES: { width: string; redact?: { left: string; width: string } }[] = [
  { width: "94%" },
  { width: "86%", redact: { left: "34%", width: "44%" } },
  { width: "90%" },
  { width: "64%", redact: { left: "18%", width: "30%" } },
  { width: "88%" },
  { width: "76%", redact: { left: "46%", width: "30%" } },
];

// Intro timeline (ms). Protected-sheet redactions form after the scan on
// sheet 1 and the first path; the verifiable sheet resolves last.
const T = { redact: 1350, grid: 2250, print: 2400, seal: 3050 };

function Fingerprint() {
  const rings = [3, 6.5, 10, 13.5, 17];
  return (
    <svg className="dv-print" viewBox="0 0 60 60" fill="none">
      {rings.map((r, i) => (
        <path
          key={r}
          className="dv-print-arc"
          style={{ animationDelay: `${T.print + i * 90}ms` }}
          d={`M${30 - r * 0.55} ${30 + r * 1.0} A ${r} ${r * 1.2} 0 1 1 ${30 + r * 0.55} ${30 + r * 1.0}`}
          stroke="#0A66C2"
          strokeWidth="1.3"
          strokeLinecap="round"
          pathLength={1}
        />
      ))}
    </svg>
  );
}

function Sheet({ variant }: { variant: Variant }) {
  const masked = variant !== "original";
  const redactBase = variant === "protected" ? T.redact : T.grid - 400;
  return (
    <div className={`dv-sheet dv-sheet-${variant}`}>
      <div className="dv-sheet-title" />
      <div className="dv-sheet-sub" />
      <div className="dv-sheet-rule" />

      <div className="dv-sheet-lines">
        {LINES.map((line, i) => (
          <div key={i} className="dv-sheet-row">
            <div className="dv-sheet-line" style={{ width: line.width }} />
            {masked && line.redact && (
              <div className="dv-sheet-redact" style={{ left: line.redact.left, width: line.redact.width, animationDelay: `${redactBase + i * 110}ms` }} />
            )}
          </div>
        ))}
      </div>

      <div className="dv-sheet-foot">
        <div className="dv-sheet-lines" style={{ flex: 1 }}>
          <div className="dv-sheet-line" style={{ width: "92%" }} />
          <div className="dv-sheet-line" style={{ width: "70%" }} />
          <div className="dv-sheet-line" style={{ width: "82%" }} />
        </div>
        <div className="dv-sheet-photo">
          <svg viewBox="0 0 40 30" width="100%" height="100%" preserveAspectRatio="none">
            <rect width="40" height="30" fill="#D6DEE6" />
            <circle cx="20" cy="12" r="5" fill="#B5C1CD" />
            <path d="M9 30c1.8-6 6-9 11-9s9.2 3 11 9Z" fill="#B5C1CD" />
          </svg>
          {masked && <div className="dv-photo-mask" style={{ animationDelay: `${redactBase + 700}ms` }} />}
        </div>
      </div>

      {variant === "original" && <div className="dv-scan" />}

      {variant === "verifiable" && (
        <>
          <div className="dv-sheet-grid" style={{ animationDelay: `${T.grid}ms` }} />
          <Fingerprint />
          <div className="dv-seal-ring" style={{ animationDelay: `${T.seal + 150}ms` }} />
          <div className="dv-seal" style={{ animationDelay: `${T.seal}ms` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="m6 12.5 4 4 8-9" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

function Connector({ drawDelay, flowDelay }: { drawDelay: number; flowDelay: number }) {
  const d = "M6 22 C 22 6, 42 38, 62 18";
  return (
    <svg className="dv-connector" width="68" height="40" viewBox="0 0 68 40" fill="none">
      <path className="dv-connector-path" style={{ animationDelay: `${drawDelay}ms` }} d={d} stroke="#AFC0D0" strokeWidth="1.4" strokeLinecap="round" pathLength={1} />
      <path className="dv-connector-flow" style={{ animationDelay: `${flowDelay}ms` }} d={d} stroke="#0A66C2" strokeWidth="2" strokeLinecap="round" pathLength={1} />
      <circle className="dv-node" style={{ animationDelay: `${drawDelay}ms` }} cx="6" cy="22" r="2.6" fill="#FFFFFF" stroke="#8FA7BD" strokeWidth="1.3" />
      <circle className="dv-node" style={{ animationDelay: `${drawDelay + 550}ms` }} cx="62" cy="18" r="2.6" fill="#FFFFFF" stroke="#8FA7BD" strokeWidth="1.3" />
    </svg>
  );
}

const STEPS: { variant: Variant; num: string; label: string }[] = [
  { variant: "original", num: "01", label: "Evidence" },
  { variant: "protected", num: "02", label: "Protected" },
  { variant: "verifiable", num: "03", label: "Verifiable" },
];

export function EvidenceStory() {
  return (
    <div className="dv-story" aria-hidden="true">
      <div className="dv-story-texture" />
      <div className="dv-story-bloom" />
      <svg className="dv-orbits" viewBox="0 0 800 340" preserveAspectRatio="none" fill="none">
        <ellipse cx="470" cy="190" rx="380" ry="118" stroke="#0A66C2" strokeOpacity="0.09" vectorEffect="non-scaling-stroke" transform="rotate(-6 470 190)" />
        <ellipse cx="520" cy="175" rx="250" ry="82" stroke="#0A66C2" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" transform="rotate(-6 520 175)" />
        <circle cx="128" cy="236" r="2.2" fill="#0A66C2" fillOpacity="0.28" />
        <circle cx="742" cy="118" r="1.8" fill="#0A66C2" fillOpacity="0.22" />
        <circle cx="330" cy="96" r="1.6" fill="#0A66C2" fillOpacity="0.18" />
      </svg>

      <div className="dv-story-track">
        {STEPS.map((step, i) => (
          <div key={step.num} style={{ display: "contents" }}>
            {i > 0 && <Connector drawDelay={i === 1 ? 800 : 1800} flowDelay={4200 + i * 1600} />}
            <div className="dv-step">
              <div className="dv-rise" style={{ animationDelay: `${i * 140}ms` }}>
                <div className="dv-float" style={{ animationDelay: `${-i * 2.6}s` }}>
                  <div className={`dv-tilt dv-tilt-${i + 1}`}>
                    {Array.from({ length: i + 1 }).map((_, e) => (
                      <div key={e} className="dv-echo" style={{ transform: `translate(${(e + 1) * 7}px, ${(e + 1) * 7}px)`, opacity: 0.9 - e * 0.22 }} />
                    ))}
                    <Sheet variant={step.variant} />
                  </div>
                </div>
                <div className="dv-ground" style={{ animationDelay: `${-i * 2.6}s` }} />
              </div>
              <div className="dv-step-cap">
                <span className="dv-step-num">{step.num}</span>
                <span className="dv-step-label">{step.label}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
