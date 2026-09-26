"use client";

/**
 * Shared frame + design tokens for the signed-in UI (dashboard, case, upload
 * and version pages), used by every role. What each role can do is decided
 * per page with can() from lib/client/permissions.ts, which mirrors the API
 * routes. Presentation only: no data fetching lives here.
 */

import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { manrope, inter } from "@/lib/client/fonts";
import { humanizeCode } from "./data";

export function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "Good morning, Officer." — the session carries no name, only the role. */
export function greeting(role: string): string {
  const h = new Date().getHours();
  const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const title = role === "POLICE_OFFICER" || role === "INVESTIGATING_OFFICER" ? "Officer" : role === "FORENSIC_LAB" ? "Examiner" : null;
  return title ? `Good ${period}, ${title}.` : `Good ${period}.`;
}

export function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export type IconName =
  | "folder" | "clock" | "file" | "review" | "anchor" | "upload" | "version" | "home" | "shield"
  | "chevron" | "back" | "plus" | "download" | "fingerprint" | "check" | "info";

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
  const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "folder":
      return <svg {...p}><path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z" {...s} /></svg>;
    case "clock":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" {...s} /><path d="M12 7.5V12l3 2" {...s} /></svg>;
    case "file":
      return <svg {...p}><path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5l-4-4Z" {...s} /><path d="M14 3.5v4h4M9 12.5h6M9 16h4" {...s} /></svg>;
    case "review":
      return <svg {...p}><circle cx="10" cy="8" r="3.5" {...s} /><path d="M3.5 19.5c.7-3.2 3.3-5 6.5-5 1.2 0 2.3.2 3.2.7" {...s} /><path d="m15 17.5 2 2 4-4.5" {...s} /></svg>;
    case "anchor":
      return <svg {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4L11.6 6" {...s} /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" {...s} /></svg>;
    case "upload":
      return <svg {...p}><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" {...s} /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" {...s} /></svg>;
    case "download":
      return <svg {...p}><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5" {...s} /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" {...s} /></svg>;
    case "version":
      return <svg {...p}><path d="M8 3.5h8.5A1.5 1.5 0 0 1 18 5v11" {...s} /><rect x="5" y="7" width="10" height="13.5" rx="1.5" {...s} /></svg>;
    case "home":
      return <svg {...p}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" {...s} /></svg>;
    case "shield":
      return <svg {...p}><path d="M12 3.5 19 6.3v5.2c0 4.4-2.8 7.5-7 9-4.2-1.5-7-4.6-7-9V6.3l7-2.8Z" {...s} /><path d="m9 12 2 2 4-4" {...s} /></svg>;
    case "fingerprint":
      return <svg {...p}><path d="M7 11a5 5 0 0 1 10 0v1.5M9.5 20c.8-1.6 1-3.4 1-5.5v-3a1.5 1.5 0 0 1 3 0v2.5M5 15.5c.3-1 .5-2.3.5-4.5a6.5 6.5 0 0 1 11.9-3.6M14.5 20c.4-1 .7-2.3.9-3.5M18.5 15c.2-.9.3-2 .3-3" {...s} /></svg>;
    case "check":
      return <svg {...p}><path d="m5.5 12.5 4 4 9-9.5" {...s} strokeWidth={2.2} /></svg>;
    case "info":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" {...s} /><path d="M12 11v5M12 8h.01" {...s} /></svg>;
    case "chevron":
      return <svg {...p}><path d="m9 6 6 6-6 6" {...s} /></svg>;
    case "back":
      return <svg {...p}><path d="M19 12H5m0 0 6-6m-6 6 6 6" {...s} /></svg>;
    case "plus":
      return <svg {...p}><path d="M12 5v14M5 12h14" {...s} strokeWidth={2.2} /></svg>;
  }
}

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 30 33" fill="none" aria-hidden="true">
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2C8.1 28.9 3 23.6 3 15.3V6L15 1.5Z" fill="#12306B" />
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2V1.5Z" fill="#0A66C2" />
      <path d="m10.2 15.6 3.3 3.3 6.4-6.8" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function caseStatusChip(status: string) {
  const s = status.toUpperCase();
  const cls = s === "OPEN" ? "ws-chip-ok" : s === "CLOSED" ? "ws-chip-neutral" : "ws-chip-blue";
  return <span className={`ws-chip ${cls}`}>{humanizeCode(s)}</span>;
}

/*
 * Shared workspace CSS. Same rule as the login page: no quote, ampersand or
 * angle-bracket characters (React escapes those differently on server and
 * client inside a <style> text child).
 */
export const WORKSPACE_CSS = `
.ws { min-height: 100vh; background: #F6F8FA; color: #1D2226; }
.ws *, .ws *::before, .ws *::after { box-sizing: border-box; }
.ws-header { position: sticky; top: 0; z-index: 10; height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 0 28px; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid #E3E8ED; }
.ws-brand { display: flex; align-items: center; gap: 12px; }
.ws-brand-name { font-family: var(--font-display); font-weight: 800; font-size: 20px; letter-spacing: -0.4px; line-height: 1.1; }
.ws-brand-sub { font-size: 12.5px; color: #5E5E5E; margin-top: 1px; }
.ws-user { display: flex; align-items: center; gap: 12px; }
.ws-avatar { width: 38px; height: 38px; border-radius: 50%; background: #0A66C2; color: #FFFFFF; display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: none; }
.ws-user-id { display: grid; line-height: 1.25; }
.ws-user-role { font-size: 14px; font-weight: 600; }
.ws-user-sn { font-size: 12.5px; color: #5E5E5E; font-variant-numeric: tabular-nums; }
.ws-signout { margin-left: 8px; background: none; border: 1px solid #D0D7DE; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 13px; color: #1D2226; cursor: pointer; }
.ws-signout:hover { background: #F3F6F9; }
.ws-signout:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; }

.ws-body { display: grid; grid-template-columns: 230px minmax(0, 1fr); min-height: calc(100vh - 72px); }
.ws-side { border-right: 1px solid #E3E8ED; background: #FBFCFD; padding: 22px 16px; }
.ws-nav { display: grid; gap: 4px; }
.ws-nav a { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 10px; color: #1D2226; text-decoration: none; font-size: 15px; font-weight: 500; }
.ws-nav a:hover { background: #EEF3F8; }
.ws-nav a.ws-nav-active { background: #EAF2FB; color: #0A66C2; font-weight: 600; }
.ws-nav a:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; }

.ws-main { padding: 30px 32px 48px; max-width: 1320px; width: 100%; }
.ws-crumb { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; font-size: 14px; font-weight: 600; color: #0A66C2; text-decoration: none; }
.ws-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ws-crumb:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; border-radius: 2px; }
.ws-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ws-title { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 800; letter-spacing: -0.8px; line-height: 1.15; }
.ws-subtitle { margin: 4px 0 0; font-size: 18px; color: #5E5E5E; }
.ws-meta-line { margin: 10px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14.5px; color: #5E5E5E; }

.ws-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; padding: 0 20px; border: 0; border-radius: 10px; background: #0A66C2; color: #FFFFFF;
  font: inherit; font-size: 15.5px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background-color 120ms ease; }
.ws-primary:hover:not(:disabled) { background: #004182; }
.ws-primary:focus-visible { outline: none; box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px #0A66C2; }
.ws-primary:disabled { background: #E3E8ED; color: #6B737A; cursor: not-allowed; }
.ws-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 16px; border: 1px solid #D0D7DE; border-radius: 10px;
  background: #FFFFFF; font: inherit; font-size: 14.5px; font-weight: 500; color: #1D2226; cursor: pointer; text-decoration: none; }
.ws-secondary:hover:not(:disabled) { background: #F3F6F9; }
.ws-secondary:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; }
.ws-secondary:disabled { color: #8A939B; cursor: not-allowed; }
.ws-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 18px; border: 0; border-radius: 10px;
  background: #CC1016; color: #FFFFFF; font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; }
.ws-danger:hover:not(:disabled) { background: #A30D12; }
.ws-danger:focus-visible { outline: none; box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px #CC1016; }
.ws-danger:disabled { background: #E3E8ED; color: #6B737A; cursor: not-allowed; }

.ws-form { margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; align-items: end;
  padding: 18px; background: #FFFFFF; border: 1px solid #E3E8ED; border-radius: 14px; }
.ws-form label, .ws-field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: #1D2226; }
.ws-input { height: 44px; border: 1px solid #D0D7DE; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 14.5px; color: #1D2226; background: #FFFFFF; }
.ws-input:focus-visible { outline: none; border-color: #0A66C2; box-shadow: 0 0 0 3px rgba(10,102,194,0.2); }
.ws-form-actions { display: flex; gap: 10px; }

.ws-alert { margin: 16px 0 0; padding: 12px 14px; border-radius: 10px; background: #FDF1F1; border: 1px solid #F4C7C8; color: #A30D12; font-size: 14px; }
.ws-note { margin: 16px 0 0; padding: 12px 14px; border-radius: 10px; background: #EEF3F8; border: 1px solid #D8E3EE; color: #1D2226; font-size: 14px; display: flex; gap: 10px; align-items: flex-start; }
.ws-success { margin: 16px 0 0; padding: 12px 14px; border-radius: 10px; background: #EAF6EF; border: 1px solid #B7DEC7; color: #05542F; font-size: 14px; }

.ws-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-top: 26px; }
.ws-card { display: flex; align-items: center; gap: 18px; padding: 22px 22px; background: #FFFFFF; border: 1px solid #E3E8ED; border-radius: 14px; box-shadow: 0 1px 2px rgba(29,34,38,0.04); }
.ws-card-icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.ws-card-value { font-family: var(--font-display); font-size: 30px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
.ws-card-label { margin-top: 6px; font-size: 15px; color: #5E5E5E; }

.ws-grid { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr); gap: 16px; margin-top: 16px; align-items: start; }
@media (max-width: 1100px) { .ws-grid { grid-template-columns: minmax(0, 1fr); } }
.ws-panel { background: #FFFFFF; border: 1px solid #E3E8ED; border-radius: 14px; padding: 24px 24px 10px; box-shadow: 0 1px 2px rgba(29,34,38,0.04); }
.ws-panel-pad { padding-bottom: 24px; }
.ws-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.ws-panel-title { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.ws-panel-sub { margin: 4px 0 0; font-size: 14.5px; color: #5E5E5E; }
.ws-more { background: none; border: 0; padding: 4px 0; font: inherit; font-size: 14px; font-weight: 600; color: #0A66C2; cursor: pointer; white-space: nowrap; }
.ws-more:hover { text-decoration: underline; text-underline-offset: 2px; }
.ws-more:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; border-radius: 2px; }

.ws-list { list-style: none; margin: 0; padding: 0; }
.ws-row { display: flex; align-items: center; gap: 16px; padding: 14px 10px; margin: 0 -10px; border-top: 1px solid #EEF1F4; border-radius: 10px;
  text-decoration: none; color: inherit; transition: background-color 120ms ease; }
.ws-list li:first-child .ws-row { border-top-color: transparent; }
a.ws-row:hover { background: #F7FAFD; }
.ws-row:focus-visible { outline: 2px solid #0A66C2; outline-offset: -2px; }
.ws-row-icon { width: 44px; height: 44px; border-radius: 10px; background: #F3F5F7; color: #5E5E5E; display: grid; place-items: center; flex: none; }
.ws-row-main { flex: 1; min-width: 0; }
.ws-row-title { font-size: 15px; font-weight: 600; color: #1D2226; }
.ws-row-sub { margin-top: 2px; font-size: 14px; color: #5E5E5E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-row-status { display: grid; justify-items: start; gap: 4px; min-width: 170px; }
.ws-row-note { font-size: 13px; color: #5E5E5E; }
.ws-row-meta { font-size: 13.5px; color: #5E5E5E; white-space: nowrap; }
.ws-chevron { color: #8A939B; flex: none; }
.ws-empty { padding: 22px 0 18px; font-size: 14.5px; color: #5E5E5E; }

.ws-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; border: 1px solid; white-space: nowrap; }
.ws-chip-warn { color: #8A5300; background: #FFF6E8; border-color: #F5D7A6; }
.ws-chip-ok { color: #057642; background: #EAF6EF; border-color: #B7DEC7; }
.ws-chip-neutral { color: #4B5358; background: #F3F5F7; border-color: #DCE1E6; }
.ws-chip-blue { color: #0A66C2; background: #EAF2FB; border-color: #C3DAF1; }

.ws-dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 20px; row-gap: 12px; margin: 8px 0 14px; font-size: 14.5px; }
.ws-dl dt { color: #5E5E5E; }
.ws-dl dd { margin: 0; color: #1D2226; font-weight: 500; overflow-wrap: anywhere; }

.ws-table-wrap { margin: 6px -8px 8px; }
.ws-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ws-table th { text-align: left; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #5E5E5E; background: #F6F8FA; padding: 10px 8px; }
.ws-table th:first-child { border-radius: 8px 0 0 8px; }
.ws-table th:last-child { border-radius: 0 8px 8px 0; }
.ws-table td { padding: 12px 8px; border-bottom: 1px solid #EEF1F4; vertical-align: middle; }
.ws-table tr:last-child td { border-bottom: 0; }
.ws-table a { color: #0A66C2; font-weight: 600; text-decoration: none; }
.ws-table a:hover { text-decoration: underline; text-underline-offset: 2px; }
.ws-action { display: inline-flex; align-items: center; gap: 12px; }
.ws-muted { color: #5E5E5E; }
.ws-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }

@media (max-width: 860px) {
  .ws-body { grid-template-columns: minmax(0, 1fr); }
  .ws-side { border-right: 0; border-bottom: 1px solid #E3E8ED; padding: 10px 16px; }
  .ws-nav { grid-auto-flow: column; justify-content: start; }
  .ws-main { padding: 22px 16px 40px; }
  .ws-header { padding: 0 16px; }
  .ws-brand-sub, .ws-user-id { display: none; }
  .ws-row-status { min-width: 0; }
  .ws-row-meta { display: none; }
  .ws-table thead { display: none; }
  .ws-table tr { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; padding: 10px 0; border-bottom: 1px solid #EEF1F4; }
  .ws-table td { border: 0; padding: 0; }
  .ws-table td:nth-child(3), .ws-table td:nth-child(4) { grid-column: 2; }
}
@media (max-width: 560px) {
  .ws-row { flex-wrap: wrap; }
  .ws-row-status { order: 3; width: 100%; padding-left: 60px; }
  .ws-title { font-size: 28px; }
  .ws-dl { grid-template-columns: minmax(0, 1fr); row-gap: 2px; }
  .ws-dl dd { margin-bottom: 10px; }
}
`;

/** Header + sidebar frame shared by every workspace page. `extraCss` is page-specific CSS (same no-quotes rule). */
export function WorkspaceShell({ active, extraCss, children }: { active: "cases" | null; extraCss?: string; children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const role = session?.role ?? "";
  const initials = role.split("_").map((w) => w.charAt(0)).join("").slice(0, 2);

  return (
    <div className={`ws ${inter.variable} ${manrope.variable} ${inter.className}`}>
      <style>{WORKSPACE_CSS + (extraCss ?? "")}</style>
      <header className="ws-header">
        <div className="ws-brand">
          <BrandMark />
          <div>
            <div className="ws-brand-name">DigiVault</div>
            <div className="ws-brand-sub">NCRB · Women Safety Division</div>
          </div>
        </div>
        <div className="ws-user">
          <span className="ws-avatar" aria-hidden="true">{initials}</span>
          <span className="ws-user-id">
            <span className="ws-user-role">{roleLabel(role)}</span>
            {session?.serviceNumber && <span className="ws-user-sn">{session.serviceNumber}</span>}
          </span>
          <button type="button" className="ws-signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="ws-body">
        <aside className="ws-side">
          <nav className="ws-nav" aria-label="Main">
            <Link href="/dashboard" className={active === "cases" ? "ws-nav-active" : undefined} aria-current={active === "cases" ? "page" : undefined}>
              <Icon name="home" /> Cases
            </Link>
            <Link href="/verify">
              <Icon name="shield" /> Verify evidence
            </Link>
          </nav>
        </aside>
        <main className="ws-main">{children}</main>
      </div>
    </div>
  );
}
