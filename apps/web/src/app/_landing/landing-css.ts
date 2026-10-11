/*
 * Landing page CSS. Values follow the reference design: Inter 500 headings
 * at -0.025em, 48px section titles, paper text at 45 to 70 percent, pill
 * buttons with a lit surface, 16px cards on #171717.
 *
 * Same rule as every other CSS string here: no quote, ampersand or
 * angle-bracket characters (React escapes those differently on server and
 * client inside a <style> text child). So no child combinators, and the
 * grid pattern below is a fully percent-encoded data URL.
 */
export const LANDING_CSS = `
.lp { min-height: 100vh; background: var(--ink); color: var(--paper); overflow-x: clip; font-family: var(--font-body), system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.lp :where(a) { color: inherit; text-decoration: none; }
.lp :where(h1, h2, h3, p) { margin: 0; }
.lp-wrap { max-width: 1152px; margin: 0 auto; padding: 0 24px; box-sizing: border-box; }
.lp-wrap-wide { max-width: 1280px; margin: 0 auto; padding: 0 24px; box-sizing: border-box; }
.lp-fill { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.lp-mono { font-family: var(--font-mono), ui-monospace, monospace; }
.lp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Buttons: lit pill surfaces */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 18px; border-radius: 999px;
  border: 1px solid transparent; font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; text-decoration: none;
  transition: filter 150ms ease, transform 150ms ease, background-color 150ms ease; }
.lp-btn:active { transform: scale(0.99); }
.lp-btn:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
.lp-btn:disabled { opacity: 0.5; cursor: default; pointer-events: none; }
.lp-btn-sm { height: 32px; padding: 0 14px; }
.lp-btn-light { color: #0a0a0a;
  background: linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0) 45%) padding-box, linear-gradient(#f5f5f5, #dcdcdc) padding-box, linear-gradient(rgba(255,255,255,0), rgba(0,0,0,0.2)) border-box;
  box-shadow: 0 0 0 1px #b8b8b8, inset 0 -3px 6px -3px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4), 0 8px 20px -8px rgba(255,255,255,0.1); }
.lp-btn-light:hover { filter: brightness(0.96); }
.lp-btn-dark { color: #ffffff;
  background: linear-gradient(#262626, #303030) padding-box, linear-gradient(#4a4a4a, #3c3c3c, #2e2e2e) border-box;
  box-shadow: 0 0 0 1px #1a1a1a, 0 1px 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4); }
.lp-btn-dark:hover { filter: brightness(1.12); }
.lp-btn-outline { color: #ffffff;
  background: linear-gradient(#1a1a1a, #141414) padding-box, linear-gradient(rgba(255,255,255,0), rgba(0,0,0,0.3)) border-box;
  box-shadow: 0 0 0 1px #2e2e2e, 0 1px 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4); }
.lp-btn-outline:hover { filter: brightness(1.3); }
.lp-btn-ghost { color: #ffffff; background: transparent; }
.lp-btn-ghost:hover { background: rgba(255,255,255,0.07); }
.lp-arrow { transition: transform 150ms ease; }
.lp-btn:hover .lp-arrow { transform: translateX(2px); }
.lp-badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: rgba(0,153,255,0.12); color: var(--brand); font-size: 11px; font-weight: 500; vertical-align: 1px; }

/* Nav: transparent over the hero, not sticky */
.lp-nav { position: absolute; top: 0; left: 0; right: 0; z-index: 30; }
.lp-nav-inner { position: relative; height: 64px; display: flex; align-items: center; justify-content: space-between; }
.lp-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--paper); }
.lp-links { position: absolute; left: 50%; transform: translateX(-50%); display: flex; gap: 32px; font-size: 14px; }
.lp-links a { color: rgba(242,239,233,0.7); transition: color 150ms ease; }
.lp-links a:hover { color: var(--paper); }
.lp-nav-cta { display: flex; align-items: center; gap: 22px; }
.lp-navlink { font-size: 14px; font-weight: 500; color: var(--paper); }

/* Hero */
.lp-hero { position: relative; isolation: isolate; }
.lp-hero-bg { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.lp-hero-photo { position: absolute; left: 0; right: 0; top: 0; height: 1100px; -webkit-mask-image: radial-gradient(ellipse 75% 70% at 50% 30%, black 25%, transparent 80%); mask-image: radial-gradient(ellipse 75% 70% at 50% 30%, black 25%, transparent 80%); }
.lp-tf-pulse { opacity: 0; animation: lp-tf-pulse 9s ease-in-out infinite; }
@keyframes lp-tf-pulse { 0%, 100% { opacity: 0; } 50% { opacity: 0.55; } }
.lp-tf-panel { -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 95%); mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 95%); }
.lp-tf-cta { -webkit-mask-image: radial-gradient(ellipse 70% 90% at 85% 20%, black 20%, transparent 85%); mask-image: radial-gradient(ellipse 70% 90% at 85% 20%, black 20%, transparent 85%); }
.lp-hero-bottom { position: absolute; left: 0; right: 0; bottom: 0; height: 640px; background: linear-gradient(to top, var(--ink) 30%, rgba(10,10,10,0.7) 60%, rgba(10,10,10,0)); }
.lp-hero-inner { position: relative; display: flex; flex-direction: column; align-items: center; padding: 176px 24px 0; text-align: center; }
.lp-pill { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border-radius: 999px; background: rgba(255,255,255,0.05);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-size: 14px; color: rgba(242,239,233,0.8); transition: background-color 150ms ease; }
.lp-pill:hover { background: rgba(255,255,255,0.1); }
.lp-pill-tag { padding: 2px 8px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 12px; font-weight: 500; }
.lp-h1 { margin-top: 32px; max-width: 20ch; font-size: 72px; line-height: 1; font-weight: 500; letter-spacing: -0.025em; text-wrap: balance; }
.lp-word { display: inline-block; animation: lp-blur-in 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.lp-word:nth-of-type(2) { animation-delay: 50ms; }
.lp-word:nth-of-type(3) { animation-delay: 100ms; }
.lp-word:nth-of-type(4) { animation-delay: 150ms; }
.lp-word:nth-of-type(5) { animation-delay: 200ms; }
.lp-word:nth-of-type(6) { animation-delay: 250ms; }
.lp-word:nth-of-type(7) { animation-delay: 300ms; }
.lp-rise { animation: lp-blur-in 800ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.lp-d2 { animation-delay: 380ms; }
.lp-d3 { animation-delay: 480ms; }
.lp-d4 { animation-delay: 620ms; }
@keyframes lp-blur-in { from { opacity: 0; filter: blur(8px); transform: translateY(8px); } to { opacity: 1; filter: blur(0); transform: none; } }
@keyframes lp-fade-up { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes lp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes lp-pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }
.lp-lede { margin-top: 24px; max-width: 48ch; font-size: 18px; line-height: 28px; color: rgba(242,239,233,0.7); text-wrap: pretty; }
.lp-hero-actions { margin-top: 40px; display: flex; align-items: center; gap: 32px; }
.lp-hero-proof { display: flex; align-items: center; gap: 12px; text-align: left; font-size: 14px; line-height: 20px; color: rgba(242,239,233,0.6); }
.lp-hero-proof b { color: var(--paper); font-weight: 500; }
.lp-hero-proof-icon { color: #f5b400; flex-shrink: 0; }
.lp-hero-app { position: relative; margin-top: 80px; }
.lp-strip { position: relative; padding-top: 48px; padding-bottom: 72px; text-align: center; }
.lp-strip p { font-size: 14px; color: rgba(242,239,233,0.6); }
.lp-strip-row { margin-top: 40px; display: grid; grid-template-columns: repeat(6, 1fr); align-items: center; gap: 24px; color: rgba(242,239,233,0.72); }
.lp-wm { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; }
.lp-wm-mono { font-family: var(--font-mono), monospace; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.lp-wm-poly { font-size: 26px; font-weight: 700; letter-spacing: -0.04em; }
.lp-wm-minio { font-size: 22px; font-weight: 400; letter-spacing: 0.18em; }
.lp-wm-webauthn { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; font-style: italic; }
.lp-wm-pdf { font-size: 25px; font-weight: 500; letter-spacing: -0.02em; }
.lp-wm-serif { font-family: Georgia, Times New Roman, serif; font-size: 25px; letter-spacing: -0.01em; }

/* Product preview: light app window with sample data */
.lp-app { display: grid; grid-template-columns: 208px minmax(0, 1fr); height: 740px; overflow: hidden; border-radius: 16px; background: #ffffff; color: #171717;
  text-align: left; font-size: 13px; box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 40px 100px -30px rgba(0,0,0,0.85); }
.lp-app-side { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-right: 1px solid #ececec; }
.lp-app-brand { display: flex; align-items: center; gap: 10px; padding: 4px 4px 12px; }
.lp-app-brand b { display: block; font-size: 13px; font-weight: 600; }
.lp-app-brand small { display: block; font-size: 11px; color: #8a8a8a; }
.lp-app-logo { width: 32px; height: 32px; border-radius: 8px; background: #0a0a0a; display: grid; place-items: center; }
.lp-app-search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border: 1px solid #e5e5e5; border-radius: 8px; color: #a3a3a3; }
.lp-app-search kbd { margin-left: auto; padding: 1px 5px; border-radius: 4px; background: #f5f5f5; font: inherit; font-size: 10.5px; color: #8a8a8a; }
.lp-app-label { margin: 14px 8px 4px; font-size: 11px; color: #a3a3a3; }
.lp-app-nav { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 8px; border-radius: 8px; color: #404040; }
.lp-app-nav-on { background: #0a0a0a; color: #ffffff; }
.lp-app-count { margin-left: auto; padding: 0 5px; border: 1px solid #e5e5e5; border-radius: 5px; font-size: 10.5px; color: #737373; }
.lp-app-caret { margin-left: auto; color: #a3a3a3; }
.lp-app-sep { height: 1px; margin: 10px 4px; background: #efefef; }
.lp-app-group { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; font-weight: 500; color: #262626; }
.lp-app-recent { display: flex; flex-direction: column; gap: 9px; margin: 6px 0 0 16px; padding-left: 12px; border-left: 1px solid #e5e5e5; font-size: 12.5px; color: #525252; }
.lp-app-recent span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-app-user { margin-top: auto; padding: 10px; border: 1px solid #ececec; border-radius: 10px; }
.lp-app-user-row { display: flex; align-items: center; gap: 10px; }
.lp-app-user-row b { display: block; font-size: 12.5px; font-weight: 500; }
.lp-app-user-row small { display: block; font-size: 11px; color: #8a8a8a; }
.lp-app-avatar { width: 30px; height: 30px; border-radius: 7px; background: linear-gradient(135deg, #c8b8a8, #6e4a3a); color: #ffffff; font-size: 11px; font-weight: 600; display: grid; place-items: center; }
.lp-app-theme { display: flex; gap: 4px; margin-top: 10px; font-size: 10.5px; color: #737373; }
.lp-app-theme span { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 5px; }
.lp-app-theme .lp-app-theme-on { background: #0a0a0a; color: #ffffff; }
.lp-app-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 20px; }
.lp-app-top { display: flex; align-items: center; justify-content: space-between; }
.lp-app-top-r { display: flex; align-items: center; gap: 8px; }
.lp-app-chip-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid #e5e5e5; border-radius: 8px; background: linear-gradient(#ffffff, #f7f7f7);
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-weight: 500; color: #262626; }
.lp-app-icon-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid #e5e5e5; border-radius: 8px; background: linear-gradient(#ffffff, #f5f5f5); color: #404040; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.lp-app-black-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; background: linear-gradient(#2a2a2a, #0a0a0a); color: #ffffff; font-weight: 500;
  box-shadow: 0 0 0 1px #0a0a0a, inset 0 1px 0 rgba(255,255,255,0.15); }
.lp-app-sample { padding: 3px 8px; border-radius: 999px; background: #fdf3d7; color: #8a6d1f; font-size: 11px; font-weight: 500; }
.lp-app-banner { position: relative; display: flex; min-height: 204px; overflow: hidden; border: 1px solid #ececec; border-radius: 12px; background: #fafafa; }
.lp-app-banner-text { position: relative; z-index: 1; width: 46%; padding: 28px 24px; box-sizing: border-box; }
.lp-app-eyebrow { font-size: 12px; font-weight: 500; color: #0077cc; }
.lp-app-banner h3 { margin-top: 10px; font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.025em; }
.lp-app-muted { margin-top: 6px; max-width: 32ch; font-size: 13px; line-height: 20px; color: #737373; }
.lp-app-banner-btn { margin-top: 18px; }
.lp-app-banner-art { position: absolute; top: 0; right: 0; bottom: 0; width: 64%; -webkit-mask-image: linear-gradient(to right, transparent, black 32%); mask-image: linear-gradient(to right, transparent, black 32%); }
.lp-app-filter { display: flex; align-items: center; justify-content: space-between; }
.lp-app-seg { display: inline-flex; padding: 3px; border-radius: 10px; background: #f4f4f4; color: #737373; }
.lp-app-seg span { padding: 5px 12px; border-radius: 7px; white-space: nowrap; }
.lp-app-seg .lp-app-seg-on { background: #ffffff; color: #171717; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04); }
.lp-app-select { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border: 1px solid #e5e5e5; border-radius: 8px; font-weight: 500; color: #262626; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.lp-app-cols { display: grid; grid-template-columns: 1.55fr 1fr; gap: 16px; }
.lp-app-h { display: flex; align-items: center; gap: 8px; margin: 4px 0 10px; font-size: 14px; font-weight: 500; color: #262626; }
.lp-app-h svg { color: #737373; }
.lp-app-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.lp-app-card { padding: 14px; border: 1px solid #ececec; border-radius: 12px; }
.lp-app-card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.lp-app-card-top b { display: block; font-size: 13px; font-weight: 500; }
.lp-app-card-top small { display: block; margin-top: 1px; font-size: 11px; color: #a3a3a3; }
.lp-app-mini-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: #f4f4f4; font-size: 10px; color: #737373; }
.lp-app-mini-seg span { padding: 2px 6px; border-radius: 4px; }
.lp-app-mini-seg .lp-app-mini-on { background: #0a0a0a; color: #ffffff; }
.lp-app-num { margin-top: 14px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.lp-app-num small { font-size: 13px; font-weight: 400; color: #a3a3a3; }
.lp-app-good { margin-top: 2px; font-size: 11.5px; color: #059669; }
.lp-app-muted-s { margin-top: 2px; font-size: 11.5px; color: #8a8a8a; }
.lp-app-spark { display: block; width: 100%; height: 48px; margin-top: 12px; }
.lp-app-bars { display: flex; align-items: flex-end; gap: 4px; height: 48px; margin-top: 12px; }
.lp-app-bars span { flex: 1; border-radius: 2px; background: #e5e5e5; }
.lp-app-bars .lp-app-bar-on { background: #0a0a0a; }
.lp-app-docs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.lp-app-doc { height: 104px; display: grid; place-items: center; border: 1px solid #ececec; border-radius: 12px; background: #f7f7f7; color: #525252; }
.lp-app-page { width: 64px; height: 78px; box-sizing: border-box; display: flex; flex-direction: column; gap: 7px; padding: 12px 9px; border: 1px solid #e5e5e5; border-radius: 4px; background: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
.lp-app-page i { display: block; height: 4px; border-radius: 2px; background: #e2e2e2; }
.lp-app-page .lp-app-redact { width: 70%; background: #0a0a0a; }
.lp-app-tilegrid { width: 78px; height: 78px; border: 1px solid #d4d4d4; border-radius: 4px; background-color: #ffffff;
  background-image: linear-gradient(#e0e0e0 1px, transparent 1px), linear-gradient(90deg, #e0e0e0 1px, transparent 1px); background-size: 7.8px 7.8px; }
.lp-app-list { margin-bottom: 14px; border: 1px solid #ececec; border-radius: 12px; }
.lp-app-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-top: 1px solid #f0f0f0; }
.lp-app-row:first-child { border-top: 0; }
.lp-app-row-icon { width: 30px; height: 30px; flex-shrink: 0; display: grid; place-items: center; border-radius: 8px; background: #f4f4f4; color: #525252; }
.lp-app-row-text { flex: 1; min-width: 0; }
.lp-app-row-text b { display: block; font-size: 13px; font-weight: 500; }
.lp-app-row-text small { display: block; font-size: 11px; color: #8a8a8a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-app-badge { padding: 3px 7px; border-radius: 6px; background: #f4f4f4; font-family: var(--font-mono), monospace; font-size: 11px; color: #525252; }
.lp-app-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-app-stat { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #ececec; border-radius: 12px; }
.lp-app-stat b { display: block; font-size: 14px; font-weight: 600; }
.lp-app-stat small { display: block; font-size: 11px; color: #8a8a8a; }

/* Sections */
.lp-section { padding: 128px 0; }
.lp-section-first { padding-top: 96px; }
.lp-h2 { max-width: 20ch; font-size: 48px; line-height: 1; font-weight: 400; letter-spacing: -0.025em; text-wrap: balance; }
.lp-h2-medium, .lp-h2-tight { font-weight: 500; }
.lp-sub { margin-top: 24px; max-width: 48ch; font-size: 18px; line-height: 28px; color: rgba(242,239,233,0.65); text-wrap: pretty; }
.lp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 40px; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; color: var(--brand); }
.lp-eyebrow-icon { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; background: rgba(0,153,255,0.15); }

/* Features: landscape panel with a floating card, then tabs */
.lp-panel { position: relative; height: 460px; margin-top: 64px; overflow: hidden; border-radius: 16px; background: #111111; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
.lp-float { position: absolute; top: 108px; left: 50%; width: 320px; box-sizing: border-box; padding: 16px; border-radius: 12px; background: #ffffff; color: #171717;
  transform: translateX(-50%); box-shadow: 0 30px 60px -20px rgba(15,40,70,0.45), 0 0 0 1px rgba(0,0,0,0.04); animation: lp-float-in 500ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
@keyframes lp-float-in { from { opacity: 0; filter: blur(4px); transform: translate(-50%, 10px) scale(0.98); } to { opacity: 1; filter: none; transform: translate(-50%, 0); } }
.lp-float-top { display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: #525252; }
.lp-live { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #e7f4ea; box-shadow: 0 0 0 1px rgba(2,135,68,0.22); color: #047857; font-size: 12px; font-weight: 500; }
.lp-live i { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
.lp-float-big { margin-top: 4px; font-size: 30px; font-weight: 500; letter-spacing: -0.02em; }
.lp-float-big small { font-size: 15px; font-weight: 400; color: #a3a3a3; }
.lp-float-list { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 12.5px; color: #262626; }
.lp-float-list li { display: flex; align-items: center; gap: 8px; animation: lp-fade-up 400ms ease both; }
.lp-float-check { width: 14px; height: 14px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: #10b981; color: #ffffff; }
.lp-float-val { margin-left: auto; font-family: var(--font-mono), monospace; font-size: 12px; color: #8a8a8a; }
.lp-float-foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid #efefef; font-size: 12px; color: #8a8a8a; }
.lp-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: 32px; }
.lp-tab { display: block; align-self: start; padding: 0; border: 0; background: none; color: rgba(242,239,233,0.45); font: inherit; text-align: left; cursor: pointer; }
.lp-tab:focus-visible { outline: 2px solid var(--paper); outline-offset: 4px; border-radius: 4px; }
.lp-tab-track { position: relative; display: block; height: 1px; margin-bottom: 20px; background: rgba(255,255,255,0.12); }
.lp-tab-bar { position: absolute; inset: 0; background: var(--paper); transform-origin: left; animation: lp-progress 7000ms linear both; }
.lp-tab-bar-full { animation: none; }
@keyframes lp-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.lp-tab-title { display: block; font-size: 14px; line-height: 20px; transition: color 150ms ease; }
.lp-tab:hover .lp-tab-title { color: rgba(242,239,233,0.8); }
.lp-tab-on .lp-tab-title, .lp-tab-on:hover .lp-tab-title { color: var(--paper); }
.lp-tab-body { display: none; max-width: 30ch; margin-top: 20px; font-size: 14px; line-height: 20px; color: rgba(242,239,233,0.65); }
.lp-tab-on .lp-tab-body { display: block; animation: lp-fade-up 400ms ease both; }

/* Custody graph */
.lp-g-section { padding: 64px 0 128px; overflow-x: clip; }
.lp-g-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.lp-g-controls { display: flex; gap: 8px; }
.lp-g-desk { position: relative; margin-top: 64px; padding: 0 24px; }
.lp-g-bg { position: absolute; top: 0; bottom: 0; left: 50%; width: 100vw; transform: translateX(-50%); pointer-events: none; }
.lp-g-bg-grid { position: absolute; left: 0; right: 0; background-position: center top;
  background-image: url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22104%22%20height%3D%22104%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22rgba%28255%2C255%2C255%2C0.07%29%22%20stroke-width%3D%221%22%20stroke-dasharray%3D%224%204%22%3E%3Cpath%20d%3D%22M0.5%200V104%22%2F%3E%3Cpath%20d%3D%22M0%200.5H104%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E); }
.lp-g-bg-line { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.08); }
.lp-g-stage { position: relative; max-width: 1392px; margin: 0 auto; }
.lp-g-canvas { position: relative; transform-origin: top left; user-select: none; -webkit-user-select: none; text-rendering: geometricPrecision; }
.lp-g-wires { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.lp-g-flow { animation: lp-flow 600ms linear infinite; }
@keyframes lp-flow { to { stroke-dashoffset: -15; } }
.lp-g-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: lp-draw 560ms cubic-bezier(0.3, 0.7, 0.2, 1) forwards; }
@keyframes lp-draw { to { stroke-dashoffset: 0; } }
.lp-g-card { position: absolute; width: 232px; height: 144px; box-sizing: border-box; border-radius: 16px; background: #171717;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.7); transition: opacity 300ms ease; }
.lp-g-card-dim { opacity: 0.55; }
.lp-g-card-ai { background: #131313; box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 12px 32px -12px rgba(0,0,0,0.7); }
.lp-g-head { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; cursor: grab; touch-action: none; }
.lp-g-head:active { cursor: grabbing; }
.lp-g-head p { font-size: 14px; font-weight: 500; color: var(--paper); white-space: nowrap; }
.lp-g-head-hub { height: 38px; padding: 0 10px; }
.lp-g-head-icon { flex-shrink: 0; color: rgba(242,239,233,0.55); }
.lp-g-grip { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; margin: 0 -6px 0 auto; padding: 0; border: 0; border-radius: 6px; background: none; color: rgba(242,239,233,0.25); cursor: grab; }
.lp-g-grip:hover { color: rgba(242,239,233,0.6); }
.lp-g-grip:focus-visible { outline: 2px solid var(--paper); }
.lp-g-tag { padding: 1px 7px; border: 1px dashed rgba(255,255,255,0.2); border-radius: 999px; font-size: 10.5px; color: rgba(242,239,233,0.5); }
.lp-g-body { height: 52px; padding: 0 14px; box-sizing: border-box; }
.lp-g-l1 { font-size: 12px; line-height: 16px; font-weight: 500; color: rgba(242,239,233,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-g-l2 { margin-top: 4px; font-size: 12px; line-height: 16px; color: rgba(242,239,233,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-g-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.lp-g-chips span { padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,0.05); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); font-size: 11px; color: rgba(242,239,233,0.7); }
.lp-g-note { padding: 6px 12px; border-radius: 8px; background: rgba(0,0,0,0.25); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); font-size: 12px; line-height: 20px; color: rgba(242,239,233,0.7); }
.lp-g-foot { display: flex; align-items: center; gap: 8px; height: 36px; font-size: 12px; color: rgba(242,239,233,0.55); }
.lp-g-foot-end { justify-content: flex-end; padding-right: 20px; }
.lp-g-foot-start { padding-left: 20px; }
.lp-g-sdot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: rgba(255,255,255,0.25); transition: background-color 300ms ease; }
.lp-g-hub { position: absolute; width: 256px; border-radius: 16px; box-shadow: 0 0 0 1px rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.7); transition: box-shadow 400ms ease; }
.lp-g-hub-sealed { box-shadow: 0 0 0 1px rgba(0,153,255,0.35), 0 20px 60px -20px rgba(0,153,255,0.45); }
.lp-g-hub-glow { position: absolute; top: -1px; left: 0; right: 0; z-index: 2; height: 64px; overflow: hidden; border-radius: 16px 16px 0 0; pointer-events: none; animation: lp-fade 500ms ease both; }
.lp-g-hub-line { position: absolute; top: 0; left: 32px; right: 32px; height: 1px; background: linear-gradient(to right, transparent, var(--brand), transparent); }
.lp-g-hub-blob { position: absolute; top: 0; left: 50%; width: 66%; height: 40px; border-radius: 999px; background: rgba(0,153,255,0.35); filter: blur(24px); transform: translate(-50%, -50%); }
.lp-g-hub-inner { position: relative; padding: 6px; border-radius: 16px; background: #141414; }
.lp-g-hub-sub { margin-left: 4px; font-size: 12px; color: rgba(242,239,233,0.4); white-space: nowrap; }
.lp-g-hub-list { position: relative; isolation: isolate; overflow: hidden; border-radius: 12px; background: #0a0a0a;
  box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 4px 12px -2px rgba(0,0,0,0.55), 0 16px 32px -12px rgba(0,0,0,0.7); }
.lp-g-hub-list ul { margin: 0; padding: 12px 0; list-style: none; }
.lp-g-hub-list li { display: flex; align-items: center; height: 56px; padding: 0 22px 0 18px; font-size: 14px; }
.lp-g-row-on { color: var(--paper); transition: color 200ms ease; }
.lp-g-row-off { color: rgba(242,239,233,0.55); }
.lp-g-check { display: inline-flex; margin-left: auto; animation: lp-pop 320ms cubic-bezier(0.3, 1.6, 0.5, 1) both; }
.lp-g-flash { position: absolute; top: -28px; left: -120px; z-index: -1; width: 112px; height: 56px; border-radius: 999px; background: var(--c); opacity: 0; filter: blur(22px); pointer-events: none; animation: lp-sweep 900ms ease-out both; }
@keyframes lp-sweep { 0% { opacity: 0; transform: translateX(0); } 25% { opacity: 0.55; } 100% { opacity: 0; transform: translateX(420px); } }
.lp-g-hub-foot { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 10px; font-size: 12px; color: rgba(242,239,233,0.5); }
.lp-g-status { animation: lp-fade-up 300ms ease both; }
.lp-g-verify { margin-left: auto; padding: 3px 10px; border-radius: 999px; background: linear-gradient(#f5f5f5, #dcdcdc); box-shadow: 0 0 0 1px #b8b8b8; color: #0a0a0a; font-size: 12px; font-weight: 500; animation: lp-pop 300ms ease both; }
.lp-g-verify:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
.lp-g-port { position: absolute; z-index: 20; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; pointer-events: none; }
.lp-g-port-btn { padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; }
.lp-g-port-grab { cursor: grab; touch-action: none; }
.lp-g-port-btn:focus-visible { outline: 2px solid var(--paper); }
.lp-g-dot { display: block; width: 12px; height: 12px; border-radius: 50%; background: var(--paper); box-shadow: 0 0 0 3px var(--ink-2); transition: background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease; }
.lp-g-port-btn:hover .lp-g-dot { transform: scale(1.25); }
.lp-g-dot-muted { width: 10px; height: 10px; background: rgba(242,239,233,0.4); }
.lp-g-dot-target { animation: lp-target 900ms ease-in-out infinite; }
@keyframes lp-target { 50% { box-shadow: 0 0 0 3px var(--ink-2), 0 0 0 9px rgba(242,239,233,0.18); } }
.lp-g-mobile { display: none; }
.lp-g-mlist, .lp-g-mrows, .lp-g-mouts { margin: 0; padding: 0; list-style: none; }
.lp-g-mlist { display: grid; gap: 8px; }
.lp-g-mitem { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; border: 0; border-radius: 12px; background: #171717; color: var(--paper); font: inherit; text-align: left; cursor: pointer;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.07), 0 12px 32px -12px rgba(0,0,0,0.7); }
.lp-g-mitem:focus-visible { outline: 2px solid var(--paper); outline-offset: 2px; }
.lp-g-micon { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: 8px; background: rgba(255,255,255,0.05); color: rgba(242,239,233,0.7); }
.lp-g-mtext { flex: 1; min-width: 0; }
.lp-g-mtext b { display: block; font-size: 16px; font-weight: 500; }
.lp-g-mtext span { display: block; font-size: 14px; color: rgba(242,239,233,0.5); }
.lp-g-mstate { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); font-size: 14px; color: rgba(242,239,233,0.45); }
.lp-g-mstate-on { background: rgba(255,255,255,0.06); box-shadow: none; color: var(--paper); }
.lp-g-mdot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: rgba(255,255,255,0.25); }
.lp-g-mline-wrap { display: flex; justify-content: center; padding: 6px 0; }
.lp-g-mline { width: 1px; height: 32px; background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.2) 0 3px, transparent 3px 7px); }
.lp-g-mline-on { background: var(--brand); box-shadow: 0 0 8px var(--brand); }
.lp-g-mhub { padding: 6px; border-radius: 16px; background: #141414; box-shadow: 0 30px 80px -30px rgba(0,0,0,0.8); transition: box-shadow 400ms ease; }
.lp-g-mhub-head { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px; font-size: 14px; }
.lp-g-mhub-head b { font-weight: 500; }
.lp-g-mhub-head span { color: rgba(242,239,233,0.4); }
.lp-g-mrows { padding: 8px; border-radius: 12px; background: #0a0a0a; }
.lp-g-mrows li { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 8px; font-size: 14px; }
.lp-g-mhub-foot { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px; font-size: 14px; color: rgba(242,239,233,0.55); }
.lp-g-mouts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.lp-g-mout { padding: 12px; border-radius: 12px; background: #171717; color: rgba(242,239,233,0.6); opacity: 0.55; transition: opacity 300ms ease; box-shadow: 0 0 0 1px rgba(255,255,255,0.07); }
.lp-g-mout:last-child { grid-column: span 2; }
.lp-g-mout-on { opacity: 1; }
.lp-g-mout-title { margin-top: 10px; font-size: 14px; font-weight: 500; color: var(--paper); }
.lp-g-mout-state { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; color: rgba(242,239,233,0.5); }
.lp-g-mnote { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 13px; color: rgba(242,239,233,0.5); }

/* Court portal: dot-matrix pages */
.lp-portal { position: relative; padding: 96px 0 128px; overflow: hidden; }
.lp-portal-art { position: absolute; top: 150px; right: -40px; width: min(1080px, 80%); pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, transparent, black 28%); mask-image: linear-gradient(to right, transparent, black 28%); }
.lp-matrix { display: block; width: 100%; height: auto; }
.lp-matrix-tag { position: absolute; display: inline-flex; align-items: center; gap: 8px; transform: translate(10px, -50%); font-family: var(--font-mono), monospace; font-size: 14px; letter-spacing: 0.02em; color: rgba(242,239,233,0.6); white-space: nowrap; }
.lp-matrix-tag b { font-weight: 500; color: var(--brand); }
.lp-portal-inner { position: relative; }
.lp-portal-head { min-height: 440px; }
.lp-portal-head .lp-h2 { margin-top: 24px; }
.lp-portal-head .lp-btn { margin-top: 40px; }
.lp-portal-stats { display: flex; justify-content: flex-end; gap: 40px; }
.lp-portal-stats div { text-align: right; }
.lp-portal-stats small { display: block; font-size: 12px; color: rgba(242,239,233,0.55); }
.lp-portal-stats b { display: block; margin-top: 4px; font-size: 24px; font-weight: 500; }
.lp-cols4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; margin-top: 72px; }
.lp-col-icon { color: var(--brand); }
.lp-col h3 { margin-top: 24px; font-size: 16px; font-weight: 500; }
.lp-col p { max-width: 30ch; margin-top: 12px; font-size: 16px; line-height: 24px; color: rgba(242,239,233,0.6); }

/* Two files in: editor and response */
.lp-dev { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 64px; }
.lp-editor, .lp-resp { display: flex; flex-direction: column; padding: 6px; border-radius: 20px; background: #141414; box-shadow: 0 0 0 1px rgba(255,255,255,0.04); }
.lp-editor-tabs { display: flex; align-items: center; gap: 4px; padding: 6px 6px 8px; }
.lp-editor-tab { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 10px; border-radius: 8px; font-family: var(--font-mono), monospace; font-size: 13px; color: rgba(242,239,233,0.4); }
.lp-editor-tab-on { background: #1f1f1f; color: var(--paper); }
.lp-editor-badge { padding: 1px 4px; border-radius: 4px; background: #2a2a2a; font-size: 9px; color: rgba(242,239,233,0.6); }
.lp-editor-run { display: inline-flex; align-items: center; gap: 6px; height: 28px; margin-left: auto; padding: 0 10px; border-radius: 8px; background: linear-gradient(#262626, #1c1c1c); box-shadow: 0 0 0 1px #2e2e2e; font-size: 13px; font-weight: 500; color: #ffffff; }
.lp-editor-body { flex: 1; padding: 14px 0; overflow: hidden; border-radius: 14px; background: #0f0f0f; font-size: 13px; line-height: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 16px 32px -12px rgba(0,0,0,0.7); }
.lp-code-line { display: flex; padding-right: 16px; white-space: pre; }
.lp-code-line-on { background: rgba(255,255,255,0.035); box-shadow: inset 2px 0 0 var(--brand); }
.lp-code-num { width: 44px; flex-shrink: 0; padding-right: 20px; box-sizing: border-box; text-align: right; color: rgba(242,239,233,0.25); }
.lp-tk-k { color: #e8a06b; }
.lp-tk-s { color: #9ccc8c; }
.lp-tk-n { color: #c3a6ff; }
.lp-tk-p { color: rgba(242,239,233,0.75); }
.lp-tk-c { color: rgba(242,239,233,0.3); }
.lp-editor-foot { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px 6px; font-size: 11.5px; color: rgba(242,239,233,0.4); }
.lp-dot-ok { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #10b981; vertical-align: middle; }
.lp-resp-inner { flex: 1; border-radius: 14px; background: #0f0f0f; box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 16px 32px -12px rgba(0,0,0,0.7); }
.lp-resp-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 14px; font-weight: 500; }
.lp-resp-live { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 400; color: rgba(242,239,233,0.6); }
.lp-resp-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
.lp-resp-q { width: fit-content; margin: 16px 16px 0; padding: 8px 14px; border-radius: 10px; background: #1f1f1f; font-size: 14px; color: rgba(242,239,233,0.9); }
.lp-checks { display: flex; flex-direction: column; gap: 12px; margin: 18px 16px 0; padding: 0; list-style: none; }
.lp-check { display: flex; gap: 10px; font-size: 14px; line-height: 20px; opacity: 0; }
.lp-check small { display: block; font-size: 12.5px; color: rgba(242,239,233,0.5); }
.lp-check-icon { width: 18px; height: 18px; flex-shrink: 0; display: grid; place-items: center; margin-top: 1px; border-radius: 50%; background: rgba(16,185,129,0.15); color: #34d399; }
.lp-resp-a { margin: 18px 16px 16px; font-size: 15px; line-height: 26px; color: var(--paper); opacity: 0; }
.lp-dev-on .lp-check, .lp-dev-on .lp-resp-a { animation: lp-fade-up 420ms ease both; }
.lp-resp-stats { display: grid; grid-template-columns: repeat(3, 1fr); padding: 16px 16px 12px; }
.lp-resp-stats small { display: block; font-size: 12.5px; color: rgba(242,239,233,0.55); }
.lp-resp-stats b { display: block; margin-top: 4px; font-size: 18px; font-weight: 500; }
.lp-caps { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 64px; border-top: 1px solid rgba(255,255,255,0.1); }
.lp-cap { position: relative; padding: 24px 16px 0 0; }
.lp-cap-on::before { content: attr(data-none); position: absolute; top: -1px; left: 0; right: 0; height: 1px; background: var(--paper); }
.lp-cap-title { font-size: 14px; font-weight: 500; color: rgba(242,239,233,0.6); }
.lp-cap-on .lp-cap-title { color: var(--paper); }
.lp-cap-body { max-width: 24ch; margin-top: 8px; font-size: 14px; line-height: 20px; color: rgba(242,239,233,0.5); }

/* Roles: catalog layout */
.lp-roles { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 64px; align-items: start; }
.lp-roles-left .lp-h2 { margin-top: 24px; }
.lp-rule { max-width: 470px; height: 1px; margin: 48px 0 40px; background: rgba(255,255,255,0.1); }
.lp-feats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 24px; max-width: 470px; margin: 0; padding: 0; list-style: none; }
.lp-feats li { display: flex; align-items: center; gap: 12px; font-size: 15px; color: rgba(242,239,233,0.85); }
.lp-feats svg { flex-shrink: 0; color: rgba(242,239,233,0.45); }
.lp-rolepanel { display: grid; grid-template-columns: 64px minmax(0, 1fr); padding: 6px; border-radius: 22px; background: #141414; box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px -40px rgba(0,0,0,0.9); }
.lp-rail { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 24px; }
.lp-rail-btn { width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 10px; background: none; color: rgba(242,239,233,0.45); cursor: pointer; transition: color 150ms ease, background-color 150ms ease; }
.lp-rail-btn:hover { background: rgba(255,255,255,0.05); color: var(--paper); }
.lp-rail-btn:focus-visible { outline: 2px solid var(--paper); }
.lp-rail-btn.lp-rail-on { background: rgba(0,153,255,0.12); color: var(--brand); }
.lp-rolebody { min-height: 520px; padding: 20px; overflow: hidden; border-radius: 16px; background: #0f0f0f; box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 16px 32px -12px rgba(0,0,0,0.7); }
.lp-rolechips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.lp-rolechip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255,255,255,0.05); font-size: 12.5px; color: rgba(242,239,233,0.7); }
.lp-rolechip-on { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); color: var(--paper); }
.lp-rolechip-on svg { color: var(--brand); }
.lp-rolechip-more { font-size: 12.5px; color: rgba(242,239,233,0.4); }
.lp-rolemsg { display: flex; gap: 10px; margin-top: 20px; }
.lp-rolemsg b { display: block; font-size: 14px; font-weight: 500; }
.lp-roleavatar { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(135deg, #c8b8a8, #6e4a3a); color: #ffffff; font-size: 9.5px; font-weight: 600; }
.lp-rolebubble { display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 10px; background: #1f1f1f; font-size: 14px; color: rgba(242,239,233,0.9); }
.lp-rolereply { margin-top: 18px; }
.lp-rolereply-who { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; }
.lp-roletrace { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: rgba(242,239,233,0.5); }
.lp-roletrace svg { color: var(--brand); }
.lp-rolelead { margin-top: 14px; font-size: 15px; color: var(--paper); }
.lp-roletable-h { margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 14px; font-weight: 500; }
.lp-roletable-wrap { margin-top: 12px; overflow: hidden; border-radius: 10px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
.lp-roletable { width: 100%; border-collapse: collapse; font-size: 13px; }
.lp-roletable th, .lp-roletable td { padding: 11px 12px; border-top: 1px solid rgba(255,255,255,0.06); font-weight: 400; text-align: left; }
.lp-roletable td { border-left: 1px solid rgba(255,255,255,0.06); color: rgba(242,239,233,0.75); }
.lp-roletable thead th { border-top: 0; background: rgba(255,255,255,0.03); font-size: 12.5px; color: rgba(242,239,233,0.6); }
.lp-roletable thead th + th { border-left: 1px solid rgba(255,255,255,0.06); }
.lp-roletable tbody th { color: var(--paper); }
.lp-roletable .lp-row-off th, .lp-roletable .lp-row-off td { color: rgba(242,239,233,0.3); }

/* CTA and footer */
.lp-cta-wrap { padding-top: 48px; padding-bottom: 128px; }
.lp-cta { position: relative; height: 520px; overflow: hidden; border-radius: 16px; background: #111111; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 6px #141414, 0 0 0 7px rgba(255,255,255,0.05), 0 40px 80px -30px rgba(0,0,0,0.9); }
.lp-cta-brand { position: absolute; top: 40px; left: 44px; display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: #f2efe9; text-shadow: 0 1px 12px rgba(0,0,0,0.3); }
.lp-cta-row { position: absolute; left: 44px; right: 40px; bottom: 40px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.lp-cta-h { font-size: 64px; line-height: 1; font-weight: 400; letter-spacing: -0.025em; color: #f2efe9; text-shadow: 0 2px 30px rgba(0,0,0,0.25); }
.lp-cta-actions { display: flex; gap: 12px; }
.lp-footer { padding: 32px 0 40px; }
.lp-footer-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 32px; }
.lp-footer-tag { max-width: 30ch; margin-top: 20px; font-size: 15px; line-height: 20px; color: rgba(242,239,233,0.6); }
.lp-footer-h { margin-bottom: 20px; font-size: 14px; font-weight: 500; color: var(--paper); }
.lp-fi { display: block; margin-bottom: 16px; font-size: 15px; color: rgba(242,239,233,0.6); transition: color 150ms ease; }
a.lp-fi:hover { color: var(--paper); }
.lp-footer-bar { display: flex; justify-content: space-between; gap: 12px; margin-top: 48px; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: rgba(242,239,233,0.5); }

/* Responsive */
@media (max-width: 1100px) {
  .lp-h1 { font-size: 60px; }
  .lp-app { grid-template-columns: minmax(0, 1fr); }
  .lp-app-side { display: none; }
  .lp-roles, .lp-dev { grid-template-columns: minmax(0, 1fr); }
  .lp-cols4 { grid-template-columns: 1fr 1fr; }
  .lp-caps { grid-template-columns: repeat(3, 1fr); row-gap: 24px; }
  .lp-strip-row { grid-template-columns: repeat(3, 1fr); row-gap: 32px; }
}
@media (max-width: 900px) {
  .lp-links { display: none; }
}
@media (max-width: 767px) {
  .lp-hero-inner { padding-top: 128px; }
  .lp-h1 { font-size: 44px; line-height: 1.04; }
  .lp-br { display: none; }
  .lp-lede, .lp-sub { font-size: 16px; line-height: 24px; }
  .lp-hero-actions { flex-direction: column; gap: 24px; }
  .lp-hero-app { margin-top: 56px; }
  .lp-app { height: 600px; }
  .lp-app-main { padding: 14px; }
  .lp-app-cols, .lp-app-metrics { grid-template-columns: minmax(0, 1fr); }
  .lp-app-banner-text { width: 100%; }
  .lp-app-banner-art { opacity: 0.35; }
  .lp-app-select, .lp-app-sample { display: none; }
  .lp-strip-row { grid-template-columns: 1fr 1fr; }
  .lp-h2 { font-size: 36px; line-height: 1.1; }
  .lp-section { padding: 88px 0; }
  .lp-section-first { padding-top: 72px; }
  .lp-panel { height: 400px; margin-top: 40px; }
  .lp-float { top: 40px; width: calc(100% - 40px); max-width: 320px; }
  .lp-tabs { grid-template-columns: 1fr 1fr; gap: 24px 16px; }
  .lp-g-intro { flex-direction: column; align-items: flex-start; }
  .lp-g-mobile { display: block; max-width: 448px; margin: 40px auto 0; padding: 0 24px; }
  .lp-g-desk { display: none; }
  .lp-portal-art { top: 230px; right: -50%; width: 170%; opacity: 0.4; }
  .lp-matrix-tag { display: none; }
  .lp-portal-head { min-height: 300px; }
  .lp-portal-stats { justify-content: flex-start; gap: 28px; }
  .lp-portal-stats div { text-align: left; }
  .lp-cols4 { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .lp-editor-body { font-size: 11.5px; overflow-x: auto; }
  .lp-editor-foot span + span { display: none; }
  .lp-caps { grid-template-columns: 1fr 1fr; }
  .lp-feats { grid-template-columns: minmax(0, 1fr); }
  .lp-rolepanel { grid-template-columns: minmax(0, 1fr); }
  .lp-rail { flex-direction: row; justify-content: center; padding: 8px 0 12px; }
  .lp-rolebody { min-height: 0; padding: 16px; }
  .lp-roletable { font-size: 12px; }
  .lp-roletable th, .lp-roletable td { padding: 10px 8px; }
  .lp-cta { height: 460px; }
  .lp-cta-brand { top: 24px; left: 24px; }
  .lp-cta-row { left: 24px; right: 24px; bottom: 24px; flex-direction: column; align-items: flex-start; }
  .lp-cta-h { font-size: 40px; }
  .lp-cta-actions { flex-wrap: wrap; }
  .lp-footer-grid { grid-template-columns: 1fr 1fr; }
  .lp-footer-bar { flex-direction: column; }
}
@media (max-width: 420px) {
  .lp-navlink { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-word, .lp-rise, .lp-float, .lp-float-list li, .lp-tab-on .lp-tab-body, .lp-g-check, .lp-g-status, .lp-g-verify, .lp-g-hub-glow, .lp-g-dot-target { animation: none; }
  .lp-g-draw { animation: none; stroke-dashoffset: 0; }
  .lp-check, .lp-resp-a, .lp-dev-on .lp-check, .lp-dev-on .lp-resp-a { opacity: 1; animation: none; }
  .lp-btn, .lp-tab-title, .lp-g-card { transition: none; }
  .lp-tf-pulse { animation: none; opacity: 0; }
}
`;
