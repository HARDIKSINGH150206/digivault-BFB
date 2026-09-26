"use client";

/**
 * Ported from Aceternity UI (fetched via
 * `npx shadcn add @aceternity/text-hover-effect-demo`). Rewritten from
 * Tailwind utility classes to inline styles — this project has no
 * Tailwind setup — and the stroke/fill colors changed from Aceternity's
 * light/dark-mode neutral palette (neutral-200 / neutral-800) to a fixed
 * dark-navy palette matching this page: neutral-800 on a near-black
 * background would be almost invisible, since this page is permanently
 * dark, not toggle-based.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

export function TextHoverEffect({
  text,
  duration,
  viewBoxWidth = 300,
  fontSize = "4.5rem",
  strokeWidth = 0.3,
}: {
  text: string;
  duration?: number;
  /** Widen for longer strings so they don't clip against the SVG viewBox. */
  viewBoxWidth?: number;
  fontSize?: string;
  /**
   * In SVG user units (viewBox space), not CSS pixels. Aceternity's
   * original 0.3 assumes a large render (viewBox scaled up several times
   * by a big container) — at a smaller container-to-viewBox ratio (like
   * this page's vertical strip) that renders as a sub-pixel hairline.
   * Scale this up for smaller containers.
   */
  strokeWidth?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });

  useEffect(() => {
    if (svgRef.current && cursor.x !== null && cursor.y !== null) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const cxPercentage = ((cursor.x - svgRect.left) / svgRect.width) * 100;
      const cyPercentage = ((cursor.y - svgRect.top) / svgRect.height) * 100;
      setMaskPosition({ cx: `${cxPercentage}%`, cy: `${cyPercentage}%` });
    }
  }, [cursor]);

  const textStyle: React.CSSProperties = {
    fontFamily: "var(--font-display, helvetica)",
    fontSize,
    fontWeight: 800,
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${viewBoxWidth} 100`}
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      style={{ userSelect: "none", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="digivaultTextGradient" gradientUnits="userSpaceOnUse" cx="50%" cy="50%" r="25%">
          {hovered && (
            <>
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="35%" stopColor="#3b82f6" />
              <stop offset="70%" stopColor="#4a90c4" />
              <stop offset="100%" stopColor="#8fc4ff" />
            </>
          )}
        </linearGradient>

        <motion.radialGradient
          id="digivaultRevealMask"
          gradientUnits="userSpaceOnUse"
          r="25%"
          initial={{ cx: "50%", cy: "50%" }}
          animate={maskPosition}
          transition={{ duration: duration ?? 0, ease: "easeOut" }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id="digivaultTextMask">
          <rect x="0" y="0" width="100%" height="100%" fill="url(#digivaultRevealMask)" />
        </mask>
      </defs>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth={strokeWidth}
        stroke="#5a7fb0"
        fill="transparent"
        style={{ ...textStyle, opacity: hovered ? 0.85 : 0.6 }}
      >
        {text}
      </text>
      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth={strokeWidth}
        stroke="#6f9bd6"
        fill="transparent"
        style={textStyle}
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        animate={{ strokeDashoffset: 0, strokeDasharray: 1000 }}
        transition={{ duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke="url(#digivaultTextGradient)"
        strokeWidth={strokeWidth}
        mask="url(#digivaultTextMask)"
        fill="transparent"
        style={textStyle}
      >
        {text}
      </text>
    </svg>
  );
}
