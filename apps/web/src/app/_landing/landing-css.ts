/*
 * Landing page CSS. Same rule as every other page-CSS string: no quote,
 * ampersand or angle-bracket characters (React escapes those differently on
 * server and client inside a <style> text child), so no child combinators.
 */
export const LANDING_CSS = `
.lp { min-height: 100vh; background: var(--ink); color: var(--paper); overflow-x: clip; }
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp :where(a) { color: inherit; }
.lp-wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.lp-mono { font-family: var(--font-mono), ui-monospace, monospace; }

.lp-nav { position: sticky; top: 0; z-index: 30; background: rgba(10,10,10,0.72); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid transparent; transition: border-color 200ms ease; }
.lp-nav-scrolled { border-bottom-color: var(--line); }
.lp-nav-inner { height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.lp-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 600; font-size: 18px; letter-spacing: -0.4px; }
.lp-links { display: flex; gap: 28px; }
.lp-links a { font-size: 14.5px; color: var(--paper-2); text-decoration: none; }
.lp-links a:hover { color: var(--paper); }
.lp-nav-cta { display: flex; align-items: center; gap: 18px; }
.lp-textlink { font-size: 14.5px; font-weight: 500; text-decoration: none; color: var(--paper); }
.lp-textlink:hover { color: #ffffff; }

.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; padding: 0 20px; border-radius: 999px; font: inherit; font-size: 14.5px; font-weight: 500; text-decoration: none; cursor: pointer; border: 0; white-space: nowrap; transition: background-color 140ms ease, transform 140ms ease; }
.lp-btn:active { transform: translateY(1px); }
.lp-btn:focus-visible, .lp-textlink:focus-visible, .lp-links a:focus-visible, .lp-tab:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.lp-btn-light { background: var(--paper); color: var(--ink); box-shadow: var(--shadow-lift); }
.lp-btn-light:hover { background: #ffffff; }
.lp-btn-dark { background: var(--ink-2); color: var(--paper); box-shadow: inset 0 0 0 1px var(--line-2); }
.lp-btn-dark:hover { background: var(--ink-4); }
.lp-btn-sm { height: 36px; padding: 0 16px; font-size: 14px; }
.lp-arrow { transition: transform 160ms ease; }
.lp-btn:hover .lp-arrow { transform: translateX(3px); }

.lp-hero { position: relative; padding: 96px 0 0; text-align: center; isolation: isolate; }
.lp-hero-bg { position: absolute; inset: 0 0 auto 0; height: 1040px; z-index: -1; pointer-events: none;
  background: radial-gradient(60% 50% at 50% 0%, rgba(0,153,255,0.16), rgba(0,153,255,0) 70%), radial-gradient(40% 40% at 15% 60%, rgba(242,239,233,0.05), rgba(242,239,233,0) 70%), linear-gradient(180deg, #121212 0%, #0a0a0a 85%); }
.lp-hero-grid { position: absolute; inset: 0 0 auto 0; height: 900px; z-index: -1; pointer-events: none;
  background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 64px 64px; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 75%); mask-image: radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 75%); }
.lp-pill { display: inline-flex; align-items: center; gap: 10px; padding: 4px 14px 4px 4px; border-radius: 999px; background: rgba(255,255,255,0.04); box-shadow: inset 0 0 0 1px var(--line-2); font-size: 14px; color: var(--paper-2); text-decoration: none; }
.lp-pill:hover { color: var(--paper); background: rgba(255,255,255,0.06); }
.lp-pill-tag { padding: 2px 9px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 12.5px; font-weight: 500; }
.lp-h1 { margin: 26px auto 0; max-width: 900px; font-size: clamp(42px, 7vw, 76px); line-height: 1.02; font-weight: 500; letter-spacing: -0.045em; text-wrap: balance; }
.lp-lede { margin: 22px auto 0; max-width: 600px; font-size: clamp(16px, 2vw, 19px); line-height: 1.55; color: var(--paper-3); text-wrap: pretty; }
.lp-hero-actions { margin-top: 36px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 28px; }
.lp-hero-proof { display: inline-flex; align-items: center; gap: 12px; text-align: left; font-size: 14px; line-height: 1.35; color: var(--paper-3); }
.lp-hero-proof strong { color: var(--paper); font-weight: 500; }
.lp-hero-proof-icon { color: var(--brand); display: grid; }

.lp-frame-wrap { margin-top: 72px; perspective: 1800px; }
.lp-frame { position: relative; text-align: left; border-radius: 18px; background: #fafaf9; color: #171717; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 40px 120px -40px rgba(0,153,255,0.25), 0 30px 80px -30px rgba(0,0,0,0.8);
  transform-origin: 50% 0%; animation: lp-tilt 1100ms cubic-bezier(0.2, 0.7, 0.2, 1) 150ms both; display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 560px; }
.lp-frame-side { border-right: 1px solid #e7e5e4; padding: 16px 12px; display: grid; align-content: start; gap: 4px; background: #ffffff; }
.lp-frame-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 14px; }
.lp-frame-brand b { display: block; font-size: 14px; font-weight: 600; }
.lp-frame-brand span { display: block; font-size: 11.5px; color: #737373; }
.lp-frame-search { display: flex; align-items: center; justify-content: space-between; height: 34px; padding: 0 10px; border-radius: 9px; box-shadow: inset 0 0 0 1px #e5e5e5; font-size: 13px; color: #a3a3a3; margin-bottom: 12px; }
.lp-frame-label { padding: 6px 8px; font-size: 11.5px; color: #a3a3a3; }
.lp-frame-nav { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; font-size: 13.5px; color: #404040; }
.lp-frame-nav-on { background: #0a0a0a; color: #fafafa; }
.lp-frame-count { margin-left: auto; font-size: 11px; padding: 0 6px; border-radius: 6px; box-shadow: inset 0 0 0 1px #e5e5e5; color: #737373; }
.lp-frame-main { padding: 18px 20px 20px; display: grid; gap: 14px; align-content: start; }
.lp-frame-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-frame-crumb { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; box-shadow: inset 0 0 0 1px #e5e5e5; font-size: 13px; color: #404040; background: #ffffff; }
.lp-frame-sample { font-size: 11.5px; font-weight: 500; padding: 3px 9px; border-radius: 999px; background: #fef3c7; color: #92400e; box-shadow: inset 0 0 0 1px #fde68a; }
.lp-frame-head { border-radius: 14px; box-shadow: inset 0 0 0 1px #e7e5e4; background: linear-gradient(100deg, #ffffff 40%, #eaf5ff 100%); padding: 16px 18px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.lp-frame-eyebrow { font-size: 12px; font-weight: 500; color: #0077cc; }
.lp-frame-title { margin-top: 4px; font-size: 21px; font-weight: 600; letter-spacing: -0.4px; }
.lp-frame-sub { margin-top: 4px; font-size: 13px; color: #737373; }
.lp-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.lp-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 3px 9px; border-radius: 999px; }
.lp-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.lp-chip-ok { background: #ecfdf5; color: #047857; box-shadow: inset 0 0 0 1px #a7f3d0; }
.lp-chip-ink { background: #171717; color: #fafafa; }
.lp-chip-blue { background: #eff8ff; color: #0369a1; box-shadow: inset 0 0 0 1px #bae6fd; }
.lp-frame-cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; }
.lp-doc { position: relative; border-radius: 12px; box-shadow: inset 0 0 0 1px #e7e5e4; background: #ffffff; padding: 26px 30px; min-height: 330px; overflow: hidden; }
.lp-doc-grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(0,153,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(0,153,255,0.09) 1px, transparent 1px); background-size: 5% 5%; }
.lp-doc-h { height: 10px; width: 46%; border-radius: 4px; background: #d4d4d4; }
.lp-doc-s { height: 6px; width: 28%; margin-top: 8px; border-radius: 3px; background: #e5e5e5; }
.lp-doc-lines { margin-top: 26px; display: grid; gap: 11px; }
.lp-doc-line { position: relative; height: 6px; border-radius: 3px; background: #ececec; }
.lp-doc-redact { position: absolute; top: -4px; height: 14px; border-radius: 2px; background: #0a0a0a; }
.lp-doc-flag { position: absolute; top: -6px; height: 18px; border-radius: 3px; box-shadow: inset 0 0 0 2px #f59e0b; background: rgba(245,158,11,0.12); }
.lp-doc-stamp { position: absolute; right: 26px; bottom: 22px; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500; padding: 5px 10px; border-radius: 999px; background: #0a0a0a; color: #fafafa; }
.lp-side-stack { display: grid; gap: 14px; align-content: start; }
.lp-mini { border-radius: 12px; box-shadow: inset 0 0 0 1px #e7e5e4; background: #ffffff; padding: 14px; }
.lp-mini-title { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 500; color: #262626; }
.lp-mini-sub { font-size: 11.5px; color: #a3a3a3; font-weight: 400; }
.lp-mini-hash { margin-top: 8px; font-size: 12.5px; color: #404040; background: #f5f5f4; border-radius: 8px; padding: 7px 9px; }
.lp-mini-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #f0f0ef; font-size: 12.5px; color: #404040; }
.lp-mini-row:first-of-type { border-top: 0; }
.lp-mini-row small { display: block; font-size: 11px; color: #a3a3a3; }
.lp-mini-check { width: 18px; height: 18px; border-radius: 50%; background: #10b981; color: #ffffff; display: grid; place-items: center; flex: none; }
.lp-mini-val { margin-left: auto; font-size: 11.5px; color: #525252; padding: 1px 7px; border-radius: 6px; background: #f5f5f4; }
.lp-bar { height: 4px; border-radius: 2px; background: #f0f0ef; margin-top: 5px; overflow: hidden; }
.lp-bar span { display: block; height: 100%; background: #0099ff; border-radius: 2px; }

.lp-strip { padding: 64px 0 24px; text-align: center; }
.lp-strip-label { font-size: 14.5px; color: var(--paper-3); }
.lp-strip-row { margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 14px 44px; }
.lp-strip-item { font-size: 19px; font-weight: 600; letter-spacing: -0.3px; color: var(--paper-4); }

.lp-section { padding: 120px 0 0; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: var(--brand); }
.lp-eyebrow-icon { width: 24px; height: 24px; border-radius: 7px; background: var(--brand-soft); display: grid; place-items: center; }
.lp-h2 { margin: 14px 0 0; max-width: 720px; font-size: clamp(34px, 5vw, 54px); line-height: 1.05; font-weight: 500; letter-spacing: -0.04em; text-wrap: balance; }
.lp-sub { margin: 18px 0 0; max-width: 560px; font-size: 17px; line-height: 1.55; color: var(--paper-3); text-wrap: pretty; }
.lp-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }

.lp-feature-stage { position: relative; margin-top: 48px; height: 460px; border-radius: 22px; overflow: hidden; display: grid; place-items: center;
  background: radial-gradient(80% 90% at 20% 10%, rgba(0,153,255,0.32), rgba(0,153,255,0) 60%), radial-gradient(70% 80% at 90% 100%, rgba(242,239,233,0.16), rgba(242,239,233,0) 60%), linear-gradient(160deg, #0f2236 0%, #101418 55%, #0c0c0c 100%);
  box-shadow: inset 0 0 0 1px var(--line); }
.lp-feature-tiles { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 46px 46px;
  -webkit-mask-image: linear-gradient(180deg, black, transparent 95%); mask-image: linear-gradient(180deg, black, transparent 95%); }
.lp-fcard { position: relative; width: min(340px, calc(100% - 40px)); border-radius: 14px; background: #ffffff; color: #171717; padding: 16px 16px 14px; box-shadow: 0 30px 80px -30px rgba(0,0,0,0.8); animation: lp-rise 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.lp-fcard-top { display: flex; align-items: center; justify-content: space-between; font-size: 13.5px; color: #525252; }
.lp-fcard-big { margin-top: 6px; font-size: 34px; font-weight: 500; letter-spacing: -1px; }
.lp-fcard-big small { font-size: 15px; color: #a3a3a3; font-weight: 400; margin-left: 4px; letter-spacing: 0; }
.lp-fcard-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 9px; }
.lp-fcard-list li { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #404040; }
.lp-fcard-meta { margin-left: auto; color: #a3a3a3; font-size: 12px; }
.lp-fcard-foot { margin-top: 14px; padding-top: 10px; border-top: 1px solid #f0f0ef; font-size: 12px; color: #a3a3a3; }
.lp-tabs { margin-top: 28px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
.lp-tab { position: relative; display: block; align-self: start; text-align: left; background: none; border: 0; padding: 20px 0 0; font: inherit; color: var(--paper-3); cursor: pointer; }
.lp-tab::before { content: attr(data-none); position: absolute; left: 0; right: 0; top: 0; height: 1px; background: var(--line-2); }
.lp-tab-bar { position: absolute; left: 0; top: 0; height: 1px; width: 0; background: var(--paper); }
.lp-tab-on .lp-tab-bar { animation: lp-progress 7s linear both; }
.lp-tab-static .lp-tab-bar { width: 100%; animation: none; }
.lp-tab-title { font-size: 15px; color: inherit; }
.lp-tab-on { color: var(--paper); }
.lp-tab-body { margin-top: 14px; font-size: 14.5px; line-height: 1.55; color: var(--paper-3); }
.lp-feature-actions { margin-top: 36px; display: flex; align-items: center; gap: 24px; }

.lp-canvas { position: relative; margin-top: 56px; padding: 56px 0; border-top: 1px dashed var(--line-2); border-bottom: 1px dashed var(--line-2);
  background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 52px 52px; }
.lp-flow { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 28px; }
.lp-node { position: relative; border-radius: 14px; background: var(--ink-2); box-shadow: var(--shadow-card); padding: 14px 14px 16px; }
.lp-node-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; }
.lp-node-icon { color: var(--paper-3); display: grid; }
.lp-node-step { margin-left: auto; font-size: 11.5px; color: var(--paper-4); }
.lp-node-body { margin-top: 10px; font-size: 13px; line-height: 1.5; color: var(--paper-3); }
.lp-node-tag { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 5px; }
.lp-node-tag span { font-size: 11px; padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--paper-2); }
.lp-node-port { position: absolute; top: 50%; right: -20px; width: 12px; height: 12px; margin-top: -6px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 0 4px rgba(251,191,36,0.15), 0 0 14px rgba(251,191,36,0.6); z-index: 1; }
.lp-node-wire { position: absolute; top: 50%; right: -28px; width: 28px; height: 2px; background: linear-gradient(90deg, rgba(251,191,36,0.9), rgba(251,191,36,0.2)); }
.lp-node-wire::after { content: attr(data-none); position: absolute; top: -2px; left: 0; width: 6px; height: 6px; border-radius: 50%; background: #fde68a; animation: lp-pulse 2.4s ease-in-out infinite; }
.lp-node-end { box-shadow: 0 0 0 1px var(--ok-line), 0 12px 32px -12px rgba(0,0,0,0.7); }
.lp-node-end .lp-node-icon { color: var(--ok); }
.lp-flow-note { margin-top: 26px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--paper-3); }
.lp-dot-ok { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 8px var(--ok); }

.lp-dev { margin-top: 48px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 20px; }
.lp-code { border-radius: 18px; background: var(--ink-3); box-shadow: var(--shadow-card); padding: 10px; display: grid; }
.lp-code-tabs { display: flex; align-items: center; gap: 6px; padding: 2px 4px 10px; }
.lp-code-tab { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; color: var(--paper-4); }
.lp-code-tab-on { background: var(--ink-2); color: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.lp-code-badge { font-size: 9.5px; padding: 1px 4px; border-radius: 4px; background: var(--ink-4); color: var(--paper-3); }
.lp-code-body { border-radius: 12px; background: #0d0d0d; padding: 14px 0; overflow-x: auto; font-size: 13px; line-height: 1.85; }
.lp-code-line { display: flex; white-space: pre; padding-right: 16px; }
.lp-code-line-on { background: rgba(255,255,255,0.03); box-shadow: inset 2px 0 0 var(--brand); }
.lp-code-num { width: 44px; flex: none; text-align: right; padding-right: 16px; color: rgba(242,239,233,0.25); }
.lp-tk-key { color: #7cc4ff; }
.lp-tk-str { color: #a5d6a7; }
.lp-tk-num { color: #fbbf24; }
.lp-tk-pun { color: rgba(242,239,233,0.55); }
.lp-code-foot { display: flex; justify-content: space-between; gap: 12px; padding: 10px 8px 2px; font-size: 11.5px; color: var(--paper-4); }
.lp-resp { border-radius: 18px; background: var(--ink-3); box-shadow: var(--shadow-card); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; }
.lp-resp-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--line); font-size: 14.5px; font-weight: 500; }
.lp-resp-live { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 400; color: var(--paper-3); }
.lp-resp-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
.lp-checks { list-style: none; margin: 0; padding: 14px 18px; display: grid; gap: 4px; align-content: start; }
.lp-check { display: flex; align-items: flex-start; gap: 10px; padding: 7px 0; font-size: 14px; color: var(--paper-2); animation: lp-rise 380ms ease-out both; }
.lp-check-icon { width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; flex: none; box-shadow: inset 0 0 0 1px var(--ok-line); }
.lp-check small { display: block; margin-top: 1px; font-size: 12px; color: var(--paper-4); }
.lp-verdict { margin: 4px 18px 16px; padding: 12px 14px; border-radius: 12px; background: var(--ok-soft); box-shadow: inset 0 0 0 1px var(--ok-line); color: var(--ok); font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
.lp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 16px 18px 18px; border-top: 1px solid var(--line); }
.lp-stat small { display: block; font-size: 12.5px; color: var(--paper-3); }
.lp-stat b { display: block; margin-top: 4px; font-size: 20px; font-weight: 500; letter-spacing: -0.4px; }

.lp-table-wrap { margin-top: 48px; overflow-x: auto; border-radius: 18px; box-shadow: inset 0 0 0 1px var(--line); }
.lp-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14.5px; }
.lp-table th, .lp-table td { padding: 15px 18px; text-align: left; border-bottom: 1px solid var(--line); }
.lp-table thead th { font-size: 14px; font-weight: 500; color: var(--paper); vertical-align: bottom; }
.lp-table thead th small { display: block; margin-top: 3px; font-size: 12px; font-weight: 400; color: var(--paper-4); }
.lp-table tbody th { font-weight: 400; color: var(--paper-2); }
.lp-table td { color: var(--paper-2); }
.lp-table .lp-col-hi { background: rgba(255,255,255,0.025); }
.lp-table-group th { padding-top: 26px; font-size: 12.5px; font-weight: 500; color: var(--brand); border-bottom: 1px solid var(--line); }
.lp-yes { color: var(--brand); display: inline-grid; }
.lp-no { color: rgba(242,239,233,0.2); }
.lp-table-note { margin-top: 16px; font-size: 13.5px; color: var(--paper-3); }

.lp-cta { position: relative; margin-top: 140px; border-radius: 26px; overflow: hidden; padding: 88px 24px; text-align: center; isolation: isolate;
  background: radial-gradient(70% 90% at 50% 120%, rgba(0,153,255,0.35), rgba(0,153,255,0) 70%), linear-gradient(180deg, #131313, #0c0c0c); box-shadow: inset 0 0 0 1px var(--line); }
.lp-cta-dots { position: absolute; inset: 0; z-index: -1; background-image: radial-gradient(rgba(242,239,233,0.14) 1px, transparent 1.4px); background-size: 14px 14px;
  -webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 100%, black, transparent 80%); mask-image: radial-gradient(ellipse 60% 70% at 50% 100%, black, transparent 80%); }
.lp-cta .lp-h2 { margin-left: auto; margin-right: auto; }
.lp-cta .lp-sub { margin-left: auto; margin-right: auto; }
.lp-cta-actions { margin-top: 34px; display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; }

.lp-footer { margin-top: 96px; border-top: 1px solid var(--line); padding: 32px 0 40px; }
.lp-footer-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; font-size: 13.5px; color: var(--paper-3); }
.lp-footer-links { display: flex; gap: 22px; }
.lp-footer-links a { text-decoration: none; color: var(--paper-3); }
.lp-footer-links a:hover { color: var(--paper); }

@keyframes lp-tilt { from { opacity: 0; transform: rotateX(18deg) translateY(40px) scale(0.96); } to { opacity: 1; transform: rotateX(0deg) translateY(0) scale(1); } }
@keyframes lp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lp-progress { from { width: 0; } to { width: 100%; } }
@keyframes lp-pulse { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: 22px; opacity: 0; } }

@media (max-width: 1000px) {
  .lp-links { display: none; }
  .lp-frame { grid-template-columns: minmax(0, 1fr); }
  .lp-frame-side { display: none; }
  .lp-frame-cols { grid-template-columns: minmax(0, 1fr); }
  .lp-flow { grid-template-columns: minmax(0, 1fr); gap: 22px; max-width: 460px; }
  .lp-node-port { top: auto; bottom: -17px; right: auto; left: 28px; margin-top: 0; }
  .lp-node-wire { top: auto; bottom: -22px; right: auto; left: 33px; width: 2px; height: 22px; background: linear-gradient(180deg, rgba(251,191,36,0.9), rgba(251,191,36,0.2)); }
  .lp-node-wire::after { display: none; }
  .lp-dev { grid-template-columns: minmax(0, 1fr); }
  .lp-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .lp-wrap { padding: 0 16px; }
  .lp-hero { padding-top: 64px; }
  .lp-nav-cta .lp-textlink { display: none; }
  .lp-section { padding-top: 88px; }
  .lp-feature-stage { height: 400px; }
  .lp-tabs { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .lp-stats { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .lp-cta { padding: 64px 18px; margin-top: 96px; }
  .lp-frame-main { padding: 14px; }
  .lp-doc { padding: 20px; min-height: 260px; }
}
@media (prefers-reduced-motion: reduce) {
  .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
}
`;
