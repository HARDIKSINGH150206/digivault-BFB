/*
 * Design tokens for every page (landing, login, workspace, verify, shares).
 * Dark palette: near-black ink surfaces, warm off-white paper text, one
 * blue accent. Pages reference these variables instead of hex values.
 *
 * Same rule as the page CSS strings: no quote, ampersand or angle-bracket
 * characters (React escapes those differently on server and client inside
 * a <style> text child).
 */
export const THEME_CSS = `
:root {
  color-scheme: dark;
  --ink: #0a0a0a;
  --ink-2: #171717;
  --ink-3: #141414;
  --ink-4: #1f1f1f;
  --paper: #f2efe9;
  --paper-2: rgba(242,239,233,0.72);
  --paper-3: rgba(242,239,233,0.55);
  --paper-4: rgba(242,239,233,0.38);
  --line: rgba(255,255,255,0.06);
  --line-2: rgba(255,255,255,0.1);
  --line-3: rgba(255,255,255,0.16);
  --dusk: #171717;
  --sand: #c8b8a8;
  --rust: #6e4a3a;
  --canvas: #f7f6f3;
  --wire-amber: #f0b24a;
  --wire-orange: #ef7a45;
  --wire-pink: #e8578f;
  --wire-violet: #9b87f5;
  --brand: #0099ff;
  --brand-soft: rgba(0,153,255,0.14);
  --brand-line: rgba(0,153,255,0.35);
  --ok: #34d399;
  --ok-soft: rgba(16,185,129,0.14);
  --ok-line: rgba(52,211,153,0.32);
  --warn: #fbbf24;
  --warn-soft: rgba(245,158,11,0.14);
  --warn-line: rgba(251,191,36,0.32);
  --danger: #f87171;
  --danger-solid: #dc2626;
  --danger-soft: rgba(239,68,68,0.14);
  --danger-line: rgba(248,113,113,0.34);
  --shadow-card: 0 0 0 1px rgba(255,255,255,0.06), 0 12px 32px -12px rgba(0,0,0,0.7);
  --shadow-lift: 0 1px 2px rgba(0,0,0,0.6), 0 4px 12px -2px rgba(0,0,0,0.55), 0 16px 32px -12px rgba(0,0,0,0.7);
  --font-display: var(--font-body), system-ui, sans-serif;
}
html, body { margin: 0; background: var(--ink); color: var(--paper); }
body { font-family: var(--font-body), system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
::selection { background: var(--brand-soft); color: var(--paper); }
`;
