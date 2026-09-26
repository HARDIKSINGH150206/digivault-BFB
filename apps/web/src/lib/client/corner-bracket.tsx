"use client";

/** Small L-shaped corner accent — the "scanner frame" touch used on cards throughout the app. */
export function CornerBracket({
  corner,
  size = 16,
  color = "#4a90c4",
}: {
  corner: "tl" | "tr" | "bl" | "br";
  size?: number;
  color?: string;
}) {
  const thickness = 2;
  const isTop = corner[0] === "t";
  const isLeft = corner[1] === "l";
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        width: size,
        height: size,
        top: isTop ? -1 : undefined,
        bottom: isTop ? undefined : -1,
        left: isLeft ? -1 : undefined,
        right: isLeft ? undefined : -1,
        borderTop: isTop ? `${thickness}px solid ${color}` : undefined,
        borderBottom: isTop ? undefined : `${thickness}px solid ${color}`,
        borderLeft: isLeft ? `${thickness}px solid ${color}` : undefined,
        borderRight: isLeft ? undefined : `${thickness}px solid ${color}`,
        opacity: 0.85,
        pointerEvents: "none",
      }}
    />
  );
}
