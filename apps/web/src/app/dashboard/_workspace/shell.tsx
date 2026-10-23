"use client";

/**
 * Shared frame + design tokens for the signed-in UI (dashboard, case, upload
 * and version pages), used by every role. What each role can do is decided
 * per page with can() from lib/client/permissions.ts, which mirrors the API
 * routes. Presentation only: no data fetching lives here.
 */

import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { fontClass } from "@/lib/client/fonts";
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
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2C8.1 28.9 3 23.6 3 15.3V6L15 1.5Z" fill="#f2efe9" />
      <path d="M15 1.5 27 6v9.3c0 8.3-5.1 13.6-12 16.2V1.5Z" fill="#d9d5cc" />
      <path d="m10.2 15.6 3.3 3.3 6.4-6.8" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
.ws { min-height: 100vh; background: var(--ink); color: var(--paper); }
.ws *, .ws *::before, .ws *::after { box-sizing: border-box; }
.ws a:focus-visible, .ws button:focus-visible, .ws summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.ws-header { position: sticky; top: 0; z-index: 10; height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 0 24px; background: var(--ink); border-bottom: 1px solid var(--line-2); }
.ws-brand { display: flex; align-items: center; gap: 10px; color: var(--paper); text-decoration: none; }
.ws-brand-name { font-weight: 600; font-size: 15px; letter-spacing: -0.02em; line-height: 1.1; }
.ws-brand-sub { margin-top: 2px; font-family: var(--font-mono), monospace; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper-4); }
.ws-user { display: flex; align-items: center; gap: 12px; }
.ws-avatar { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line-2); color: var(--paper-2); display: grid; place-items: center; font-family: var(--font-mono), monospace; font-size: 11px; font-weight: 500; flex: none; }
.ws-user-id { display: grid; line-height: 1.3; }
.ws-user-role { font-size: 13px; font-weight: 500; }
.ws-user-sn { font-size: 11.5px; color: var(--paper-4); font-family: var(--font-mono), ui-monospace, monospace; }
.ws-signout { margin-left: 4px; height: 32px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 500; color: var(--paper-2); cursor: pointer; transition: border-color 120ms ease, color 120ms ease; }
.ws-signout:hover { border-color: var(--line-3); color: var(--paper); }

.ws-body { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: calc(100vh - 60px); }
.ws-side { border-right: 1px solid var(--line-2); padding: 20px 12px; }
.ws-side-label { margin: 0 0 10px 12px; font-family: var(--font-mono), monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper-4); }
.ws-nav { display: grid; gap: 2px; }
.ws-nav a { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px; border-radius: 8px; color: var(--paper-3); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 120ms ease, background-color 120ms ease; }
.ws-nav a svg { width: 18px; height: 18px; }
.ws-nav a:hover { color: var(--paper); }
.ws-nav a.ws-nav-active { background: var(--ink-3); color: var(--paper); box-shadow: inset 0 0 0 1px var(--line-2); }

.ws-main { padding: 36px 40px 64px; max-width: 1320px; width: 100%; }
.ws-crumb { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; font-size: 13px; font-weight: 500; color: var(--paper-3); text-decoration: none; }
.ws-crumb svg { width: 16px; height: 16px; }
.ws-crumb:hover { color: var(--paper); }
.ws-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ws-title { margin: 0; font-size: 32px; font-weight: 500; letter-spacing: -0.025em; line-height: 1.15; color: var(--paper); }
.ws-subtitle { margin: 8px 0 0; font-size: 15px; color: var(--paper-3); }
.ws-meta-line { margin: 12px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; color: var(--paper-3); }
.ws-eyebrow { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 12px; font-family: var(--font-mono), monospace; font-size: 11.5px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper-4); }

.ws-primary, .ws-secondary, .ws-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 10px;
  font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
.ws-primary svg, .ws-secondary svg, .ws-danger svg { width: 16px; height: 16px; }
.ws-primary { border: 1px solid var(--paper); background: var(--paper); color: var(--ink); }
.ws-primary:hover:not(:disabled) { background: #ffffff; border-color: #ffffff; }
.ws-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.ws-secondary { border: 1px solid var(--line-2); background: transparent; color: var(--paper); }
.ws-secondary:hover:not(:disabled) { border-color: var(--line-3); background: var(--ink-3); }
.ws-secondary:disabled { color: var(--paper-4); cursor: not-allowed; }
.ws-danger { border: 1px solid var(--danger-solid); background: var(--danger-solid); color: #ffffff; }
.ws-danger:hover:not(:disabled) { background: #b91c1c; border-color: #b91c1c; }
.ws-danger:disabled { opacity: 0.4; cursor: not-allowed; }

.ws-form { margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; align-items: end;
  padding: 18px; border: 1px solid var(--line-2); border-radius: 12px; }
.ws-form label, .ws-field { display: grid; gap: 6px; font-size: 13px; font-weight: 500; color: var(--paper-2); }
.ws-input { height: 40px; border: 1px solid var(--line-2); border-radius: 10px; padding: 0 12px; font: inherit; font-size: 14px; color: var(--paper); background: var(--ink-3); transition: border-color 120ms ease; }
.ws-input:hover { border-color: var(--line-3); }
.ws-input::placeholder { color: var(--paper-4); }
.ws-input:focus-visible { outline: none; border-color: var(--paper-3); box-shadow: 0 0 0 3px rgba(242,239,233,0.08); }
.ws-form-actions { display: flex; gap: 10px; }

.ws-alert, .ws-note, .ws-success { margin: 16px 0 0; padding: 11px 14px; border-radius: 10px; border: 1px solid; font-size: 14px; line-height: 1.5; }
.ws-alert { background: var(--danger-soft); border-color: var(--danger-line); color: var(--danger); }
.ws-note { border-color: var(--line-2); color: var(--paper-2); display: flex; gap: 10px; align-items: flex-start; }
.ws-success { background: var(--ok-soft); border-color: var(--ok-line); color: var(--ok); }

.ws-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 32px; border: 1px solid var(--line-2); border-radius: 12px; overflow: hidden; }
.ws-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; padding: 20px 22px; border-left: 1px solid var(--line-2); margin-left: -1px; }
.ws-card-icon { order: 2; color: var(--paper-4); display: flex; }
.ws-card-icon svg { width: 18px; height: 18px; }
.ws-card-value { font-size: 30px; font-weight: 500; letter-spacing: -0.025em; line-height: 1; font-variant-numeric: tabular-nums; }
.ws-card-label { margin-top: 8px; font-size: 13px; color: var(--paper-3); }

.ws-grid { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr); gap: 16px; margin-top: 16px; align-items: start; }
@media (max-width: 1100px) { .ws-grid { grid-template-columns: minmax(0, 1fr); } }
.ws-panel { border: 1px solid var(--line-2); border-radius: 12px; padding: 20px 20px 8px; }
.ws-panel-pad { padding-bottom: 20px; }
.ws-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.ws-panel-title { margin: 0; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; color: var(--paper); }
.ws-panel-sub { margin: 4px 0 0; font-size: 13px; color: var(--paper-4); }
.ws-more { background: none; border: 0; padding: 4px 0; font: inherit; font-size: 13px; font-weight: 500; color: var(--paper-3); cursor: pointer; white-space: nowrap; text-decoration: none; transition: color 120ms ease; }
.ws-more:hover { color: var(--paper); }

.ws-list { list-style: none; margin: 0; padding: 0; }
.ws-row { display: flex; align-items: center; gap: 14px; padding: 12px 10px; margin: 0 -10px; border-top: 1px solid var(--line); border-radius: 8px;
  text-decoration: none; color: inherit; transition: background-color 120ms ease; }
.ws-list li:first-child .ws-row { border-top-color: transparent; }
a.ws-row:hover { background: var(--ink-3); }
.ws-row:focus-visible { outline-offset: -2px; }
.ws-row-icon { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--line-2); color: var(--paper-3); display: grid; place-items: center; flex: none; }
.ws-row-icon svg { width: 18px; height: 18px; }
.ws-row-main { flex: 1; min-width: 0; }
.ws-row-title { font-size: 14px; font-weight: 500; color: var(--paper); }
.ws-row-sub { margin-top: 2px; font-size: 13px; color: var(--paper-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-row-status { display: grid; justify-items: start; gap: 4px; min-width: 170px; }
.ws-row-note { font-size: 12.5px; color: var(--paper-4); }
.ws-row-meta { font-size: 13px; color: var(--paper-3); white-space: nowrap; }
.ws-chevron { color: var(--paper-4); flex: none; }
.ws-chevron svg { width: 18px; height: 18px; }
.ws-empty { padding: 22px 0 18px; font-size: 14px; color: var(--paper-3); }

.ws-chip { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid var(--line-2); color: var(--paper-2); background: transparent; white-space: nowrap; }
.ws-chip::before { content: attr(data-none); width: 6px; height: 6px; border-radius: 50%; background: var(--chip, var(--paper-4)); flex: none; }
.ws-chip-warn { --chip: var(--warn); }
.ws-chip-ok { --chip: var(--ok); }
.ws-chip-neutral { --chip: var(--paper-4); }
.ws-chip-blue { --chip: var(--brand); }
.ws-deadline-on_track { --chip: var(--paper-4); }
.ws-deadline-amber { --chip: var(--warn); border-color: var(--warn); color: var(--warn); }
.ws-deadline-red { --chip: var(--danger); border-color: var(--danger-line); color: var(--danger); }
.ws-deadline-overdue { --chip: var(--danger); border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); font-weight: 600; }

.ws-dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 24px; row-gap: 12px; margin: 8px 0 14px; font-size: 14px; }
.ws-dl dt { color: var(--paper-4); }
.ws-dl dd { margin: 0; color: var(--paper); font-weight: 500; overflow-wrap: anywhere; }

.ws-table-wrap { margin: 4px 0 8px; }
.ws-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ws-table th { text-align: left; font-size: 12px; font-weight: 500; color: var(--paper-4); padding: 0 8px 10px; border-bottom: 1px solid var(--line-2); }
.ws-table td { padding: 12px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; color: var(--paper-2); }
.ws-table tr:last-child td { border-bottom: 0; }
.ws-table a { color: var(--paper); font-weight: 500; text-decoration: none; }
.ws-table a:hover { text-decoration: underline; text-underline-offset: 3px; }
.ws-action { display: inline-flex; align-items: center; gap: 12px; }
.ws-muted { color: var(--paper-3); }
.ws-mono { font-family: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }

@media (max-width: 860px) {
  .ws-body { grid-template-columns: minmax(0, 1fr); }
  .ws-side { border-right: 0; border-bottom: 1px solid var(--line-2); padding: 8px 16px; }
  .ws-side-label { display: none; }
  .ws-nav { grid-auto-flow: column; justify-content: start; }
  .ws-main { padding: 24px 16px 40px; }
  .ws-header { padding: 0 16px; }
  .ws-brand-sub, .ws-user-id { display: none; }
  .ws-row-status { min-width: 0; }
  .ws-row-meta { display: none; }
  .ws-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ws-card { border-top: 1px solid var(--line-2); margin-top: -1px; }
  .ws-table thead { display: none; }
  .ws-table tr { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .ws-table td { border: 0; padding: 0; }
  .ws-table td:nth-child(3), .ws-table td:nth-child(4) { grid-column: 2; }
}
@media (max-width: 560px) {
  .ws-row { flex-wrap: wrap; }
  .ws-row-status { order: 3; width: 100%; padding-left: 50px; }
  .ws-title { font-size: 26px; }
  .ws-card { padding: 16px; }
  .ws-card-value { font-size: 24px; }
  .ws-dl { grid-template-columns: minmax(0, 1fr); row-gap: 2px; }
  .ws-dl dd { margin-bottom: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .ws *, .ws *::before, .ws *::after { transition: none !important; }
}
`;

/** Header + sidebar frame shared by every workspace page. `extraCss` is page-specific CSS (same no-quotes rule). */
export function WorkspaceShell({ active, extraCss, children }: { active: "cases" | "audit" | null; extraCss?: string; children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const role = session?.role ?? "";
  const initials = role.split("_").map((w) => w.charAt(0)).join("").slice(0, 2);

  return (
    <div className={`ws ${fontClass}`}>
      <style>{WORKSPACE_CSS + (extraCss ?? "")}</style>
      <header className="ws-header">
        <Link href="/dashboard" className="ws-brand">
          <BrandMark size={26} />
          <div>
            <div className="ws-brand-name">DigiVault</div>
            <div className="ws-brand-sub">NCRB · Women Safety Division</div>
          </div>
        </Link>
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
          <p className="ws-side-label">Workspace</p>
          <nav className="ws-nav" aria-label="Main">
            <Link href="/dashboard" className={active === "cases" ? "ws-nav-active" : undefined} aria-current={active === "cases" ? "page" : undefined}>
              <Icon name="home" /> Cases
            </Link>
            {role === "ADMIN" && (
              <Link href="/dashboard/audit" className={active === "audit" ? "ws-nav-active" : undefined} aria-current={active === "audit" ? "page" : undefined}>
                <Icon name="check" /> Audit log
              </Link>
            )}
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
