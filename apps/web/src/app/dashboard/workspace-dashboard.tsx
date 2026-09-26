"use client";

/**
 * Evidence dashboard for POLICE_OFFICER, FORENSIC_LAB and COURT_OFFICIAL
 * (INVESTIGATING_OFFICER and ADMIN get ./_workspace/investigation-dashboard).
 * Every number, row and status comes from existing API routes:
 *   GET /api/v1/cases                          -> cases, counts, recent cases
 *   + everything loadEvidence() calls           -> evidence files, anchor state, pending review
 *   POST /api/v1/cases                         -> "New Case" (only for roles the API allows)
 * There is no notifications, user-profile or audit-log endpoint, so none of
 * those appear.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon, caseStatusChip, relativeTime, greeting } from "./_workspace/shell";
import { loadEvidence, buildActivity, anchorState, type CaseRow, type Evidence } from "./_workspace/data";
import { ActivityPanel } from "./_workspace/activity-table";
import { NewCaseControl } from "./_workspace/new-case";

const PREVIEW_ROWS = 5;

const SUBTITLES: Record<string, string> = {
  POLICE_OFFICER: "Your evidence workspace",
  FORENSIC_LAB: "Every stored version, with its fingerprint and anchor record",
  COURT_OFFICIAL: "Case documents, certificates and verification bundles",
};

export function WorkspaceDashboard() {
  const { session } = useAuth();
  const role = session?.role ?? "";
  // Roles that may read redaction suggestions see what is waiting for review;
  // the read-only roles see recent evidence and its anchor state instead.
  const canViewSuggestions = can(role, "viewRedactionSuggestions");

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ evidence: boolean; cases: boolean }>({ evidence: false, cases: false });

  const load = useCallback(async () => {
    const { cases: caseRows } = await apiJson<{ cases: CaseRow[] }>("/api/v1/cases");
    const ev = await loadEvidence(caseRows, canViewSuggestions);
    setCases(caseRows);
    setEvidence(ev);
  }, [canViewSuggestions]);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your workspace."))
      .finally(() => setLoading(false));
  }, [load]);

  const openCases = cases.filter((c) => c.status.toUpperCase() === "OPEN").length;
  const needsReview = evidence.filter((e) => (e.pendingSuggestions ?? 0) > 0);
  const anchored = evidence.filter((e) => e.version !== null && anchorState(e.version) === "anchored");
  const activity = useMemo(() => buildActivity(cases, evidence), [cases, evidence]);

  const cards = [
    { icon: "folder" as const, tone: { bg: "#EAF2FB", fg: "#0A66C2" }, value: cases.length, label: "Total Cases" },
    { icon: "clock" as const, tone: { bg: "#E6F4EC", fg: "#057642" }, value: openCases, label: "Open Cases" },
    { icon: "file" as const, tone: { bg: "#EEF1FA", fg: "#3B5BA9" }, value: evidence.length, label: "Evidence Files" },
    canViewSuggestions
      ? { icon: "review" as const, tone: { bg: "#FFF3E3", fg: "#B36B00" }, value: needsReview.length, label: "Review Required" }
      : { icon: "anchor" as const, tone: { bg: "#F0EDFA", fg: "#5B3FB5" }, value: anchored.length, label: "Anchored Evidence" },
  ];

  const leftItems = canViewSuggestions ? needsReview : evidence;
  const visibleEvidence = expanded.evidence ? leftItems : leftItems.slice(0, PREVIEW_ROWS);
  const visibleCases = expanded.cases ? cases : cases.slice(0, PREVIEW_ROWS);

  return (
    <WorkspaceShell active="cases">
      <div className="ws-title-row">
        <div>
          <h1 className="ws-title">{greeting(role)}</h1>
          <p className="ws-subtitle">{SUBTITLES[role] ?? "Your evidence workspace"}</p>
        </div>
        {can(role, "createCase") && <NewCaseControl onCreated={load} />}
      </div>

      {error && <p className="ws-alert" role="alert">Could not load your workspace: {error}</p>}

      <section className="ws-cards" aria-label="Summary" aria-busy={loading}>
        {cards.map((c) => (
          <div key={c.label} className="ws-card">
            <span className="ws-card-icon" style={{ background: c.tone.bg, color: c.tone.fg }}>
              <Icon name={c.icon} />
            </span>
            <div>
              <div className="ws-card-value">{loading ? "–" : c.value}</div>
              <div className="ws-card-label">{c.label}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="ws-grid">
        <section className="ws-panel" aria-labelledby="ws-left-title">
          <div className="ws-panel-head">
            <div>
              <h2 id="ws-left-title" className="ws-panel-title">{canViewSuggestions ? "Evidence requiring attention" : "Recent evidence"}</h2>
              <p className="ws-panel-sub">{canViewSuggestions ? "Documents with redaction suggestions still to review." : "Documents across all cases, newest first."}</p>
            </div>
            {leftItems.length > PREVIEW_ROWS && (
              <button type="button" className="ws-more" onClick={() => setExpanded((x) => ({ ...x, evidence: !x.evidence }))}>
                {expanded.evidence ? "Show less" : `View all (${leftItems.length})`}
              </button>
            )}
          </div>
          {loading ? (
            <p className="ws-empty">Loading…</p>
          ) : leftItems.length === 0 ? (
            <p className="ws-empty">{canViewSuggestions ? "No evidence is waiting for redaction review." : "No evidence has been uploaded yet."}</p>
          ) : (
            <ul className="ws-list">
              {visibleEvidence.map((e) => (
                <li key={e.doc.id}>
                  <EvidenceRow e={e} showReview={canViewSuggestions} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ws-panel" aria-labelledby="ws-cases-title">
          <div className="ws-panel-head">
            <div>
              <h2 id="ws-cases-title" className="ws-panel-title">Recent cases</h2>
              <p className="ws-panel-sub">Newest first, with their status.</p>
            </div>
            {cases.length > PREVIEW_ROWS && (
              <button type="button" className="ws-more" onClick={() => setExpanded((x) => ({ ...x, cases: !x.cases }))}>
                {expanded.cases ? "Show less" : `View all (${cases.length})`}
              </button>
            )}
          </div>
          {loading ? (
            <p className="ws-empty">Loading…</p>
          ) : cases.length === 0 ? (
            <p className="ws-empty">No cases yet.</p>
          ) : (
            <ul className="ws-list">
              {visibleCases.map((kase) => (
                <li key={kase.id}>
                  <Link className="ws-row" href={`/dashboard/cases/${kase.id}`}>
                    <span className="ws-row-main">
                      <div className="ws-row-title">{kase.case_number}</div>
                      <div className="ws-row-sub">
                        {kase.department} · {kase.document_count} document{kase.document_count === 1 ? "" : "s"}
                      </div>
                    </span>
                    {caseStatusChip(kase.status)}
                    <span className="ws-row-meta">Opened {relativeTime(kase.created_at)}</span>
                    <span className="ws-chevron"><Icon name="chevron" size={18} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ActivityPanel rows={activity} loading={loading} />
    </WorkspaceShell>
  );
}

/** One evidence row. `showReview` shows pending-suggestion status (Police); otherwise anchor status. */
export function EvidenceRow({ e, showReview, showCase = true }: { e: Evidence; showReview: boolean; showCase?: boolean }) {
  const href = e.doc.current_version_id ? `/dashboard/documents/${e.doc.id}/versions/${e.doc.current_version_id}` : null;
  const state = e.version ? anchorState(e.version) : null;
  const chip =
    state === "anchored" ? { cls: "ws-chip-ok", label: "Anchored" }
    : state === "pending" ? { cls: "ws-chip-blue", label: "Anchoring…" }
    : state === "failed" ? { cls: "ws-chip-warn", label: "Anchoring failed" }
    : { cls: "ws-chip-neutral", label: "Not anchored" };
  const pending = e.pendingSuggestions ?? 0;
  const content = (
    <>
      <span className="ws-row-icon"><Icon name="file" /></span>
      <span className="ws-row-main">
        <div className="ws-row-title">{showCase ? e.kase.case_number : e.doc.title}</div>
        <div className="ws-row-sub">{showCase ? e.doc.title : `${e.doc.doc_type} · Added ${relativeTime(e.doc.created_at)}`}</div>
      </span>
      <span className="ws-row-status">
        {showReview && pending > 0 ? (
          <>
            <span className="ws-chip ws-chip-warn">Review required</span>
            <span className="ws-row-note">{pending} suggestion{pending === 1 ? "" : "s"} to review</span>
          </>
        ) : (
          <>
            <span className={`ws-chip ${chip.cls}`}>{chip.label}</span>
            <span className="ws-row-note">
              {e.version ? `Version ${e.version.version_no}` : "No version"}
              {showCase ? ` · Added ${relativeTime(e.doc.created_at)}` : ""}
            </span>
          </>
        )}
      </span>
      {href && <span className="ws-chevron"><Icon name="chevron" size={18} /></span>}
    </>
  );
  return href ? <Link className="ws-row" href={href}>{content}</Link> : <div className="ws-row">{content}</div>;
}
