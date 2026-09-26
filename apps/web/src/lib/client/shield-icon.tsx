"use client";

import { useId } from "react";

/** Shared brand mark — steel-gradient shield with a faint vertical split. Used on login and in the app nav. */
export function ShieldIcon({ size = 64 }: { size?: number }) {
  const id = useId();
  const gradId = `shieldGrad-${id}`;
  const clipId = `shieldRightHalf-${id}`;
  const height = Math.round(size * 1.125);

  return (
    <svg width={size} height={height} viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8899aa" />
          <stop offset="50%" stopColor="#4a5568" />
          <stop offset="100%" stopColor="#2d3748" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="32" y="0" width="32" height="72" />
        </clipPath>
      </defs>
      <path d="M32 2 L58 12 L58 33 C58 52 47 64 32 70 C17 64 6 52 6 33 L6 12 Z" fill={`url(#${gradId})`} />
      <path
        d="M32 2 L58 12 L58 33 C58 52 47 64 32 70 C17 64 6 52 6 33 L6 12 Z"
        fill="#000000"
        opacity="0.16"
        clipPath={`url(#${clipId})`}
      />
      <line x1="32" y1="2" x2="32" y2="70" stroke="#1a202c" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}
