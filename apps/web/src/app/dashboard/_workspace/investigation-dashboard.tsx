"use client";

/**
 * Investigation dashboard for INVESTIGATING_OFFICER and ADMIN. Case-centric; every
 * value comes from existing API routes via loadEvidence()/buildActivity():
 *   GET /api/v1/cases
 *   GET /api/v1/cases/{caseId}/documents
 *   GET /api/v1/documents/{d}/versions/{v}                        (anchor state, version)
 *   GET /api/v1/documents/{d}/versions/{v}/redaction-suggestions  (pending review)
 *   POST /api/v1/cases                                            ("+ New Case")
 * There is no case-assignment, notification or audit-log endpoint, so the
 * dashboard shows all cases (not "my" cases) and builds activity/timeline
 * from the timestamps on case, document, version and anchor records.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon, caseStatusChip, relativeTime, formatDateTime, greeting } from "./shell";
import { loadEvidence, buildActivity, anchorState, humanizeCode, type CaseRow, type Evidence, type ActivityRow } from "./data";
import { ActivityPanel } from "./activity-table";
import { NewCaseControl } from "./new-case";

const PREVIEW_ROWS = 5;

const IO_CSS = `
.io-grid-top { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 16px; margin-top: 16px; align-items: start; }
.io-grid-bottom { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 16px; align-items: start; }
.io-grid-bottom .ws-panel { margin-top: 16px; }
@media (max-width: 1180px) { .io-grid-top, .io-grid-bottom { grid-template-columns: minmax(0, 1fr); } }

.io-cases { width: 100%; border-collapse: collapse; font-size: 14px; margin: 4px 0 8px; }
.io-cases th { text-align: left; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #5E5E5E; background: #F6F8FA; padding: 10px 10px; }
.io-cases th:first-child { border-radius: 8px 0 0 8px; }
.io-cases th:last-child { border-radius: 0 8px 8px 0; }
.io-cases td { padding: 12px 10px; border-bottom: 1px solid #EEF1F4; vertical-align: middle; }
.io-cases tbody tr { cursor: pointer; transition: background-color 120ms ease; }
.io-cases tbody tr:hover { background: #F7FAFD; }
.io-cases tbody tr:last-child td { border-bottom: 0; }
.io-cases td.io-when, .io-cases td:first-child { white-space: nowrap; }
.io-sub { font-size: 12.5px; color: #5E5E5E; margin-top: 2px; }
.io-cases-wrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
.io-cases a { color: #0A66C2; font-weight: 600; text-decoration: none; }
.io-cases a:hover { text-decoration: underline; text-underline-offset: 2px; }
.io-cases a:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; border-radius: 2px; }

.io-tl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.io-select { height: 40px; min-width: 180px; border: 1px solid #D0D7DE; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 14px; color: #1D2226; background: #FFFFFF; }
.io-select:focus-visible { outline: none; border-color: #0A66C2; box-shadow: 0 0 0 3px rgba(10,102,194,0.2); }
.io-tl { list-style: none; margin: 0 0 12px; padding: 0; position: relative; }
.io-tl-item { position: relative; display: grid; grid-template-columns: 16px 30px minmax(0, 1fr); column-gap: 12px; padding: 10px 0; }
.io-tl-rail { position: relative; display: flex; justify-content: center; }
.io-tl-rail span.io-tl-line { position: absolute; top: 18px; bottom: -22px; width: 2px; background: #E3E8ED; }
.io-tl-item:last-child .io-tl-line { display: none; }
.io-tl-dot { position: relative; z-index: 1; width: 10px; height: 10px; margin-top: 7px; border-radius: 50%; }
.io-tl-icon { display: flex; justify-content: center; padding-top: 1px; }
.io-tl-when { font-size: 12.5px; color: #5E5E5E; }
.io-tl-what { font-size: 14.5px; font-weight: 600; color: #1D2226; margin-top: 1px; }
.io-tl-detail { font-size: 13.5px; color: #5E5E5E; margin-top: 1px; overflow-wrap: anywhere; }
.io-tl-detail a { color: #0A66C2; text-decoration: none; font-weight: 600; }
.io-tl-detail a:hover { text-decoration: underline; text-underline-offset: 2px; }

@media (max-width: 860px) {
  .io-cases thead { display: none; }
  .io-cases tr { display: grid; grid-template-columns: 1fr auto; row-gap: 4px; padding: 10px 0; border-bottom: 1px solid #EEF1F4; }
  .io-cases td { border: 0; padding: 0; }
  .io-cases td.io-hide-sm { display: none; }
}
`;

type AttentionItem = { e: Evidence; kind: "review" | "anchor" };

export function InvestigationDashboard() {
  const { session } = useAuth();
  const router = useRouter();
  const role = session?.role ?? "";
  const canViewSuggestions = can(role, "viewRedactionSuggestions");
  const canAnchor = can(role, "anchorVersion");

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState({ attention: false, cases: false });
  const [timelineCaseId, setTimelineCaseId] = useState<string>("");

  const load = useCallback(async () => {
    const { cases: caseRows } = await apiJson<{ cases: CaseRow[] }>("/api/v1/cases");
    const ev = await loadEvidence(caseRows, canViewSuggestions);
    setCases(caseRows);
    setEvidence(ev);
  }, [canViewSuggestions]);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your cases."))
      .finally(() => setLoading(false));
  }, [load]);

  const allEvents = useMemo(() => buildActivity(cases, evidence, Number.MAX_SAFE_INTEGER), [cases, evidence]);

  // Latest real timestamp per case (case opened / evidence uploaded / version / anchor).
  const lastActivity = useMemo(() => {
    const m = new Map<string, string>();
    for (const ev of allEvents) if (!m.has(ev.kase.id)) m.set(ev.kase.id, ev.at);
    return m;
  }, [allEvents]);

  const casesByActivity = useMemo(
    () => [...cases].sort((a, b) => new Date(lastActivity.get(b.id) ?? b.created_at).getTime() - new Date(lastActivity.get(a.id) ?? a.created_at).getTime()),
    [cases, lastActivity]
  );

  useEffect(() => {
    if (!timelineCaseId && casesByActivity[0]) setTimelineCaseId(casesByActivity[0].id);
  }, [casesByActivity, timelineCaseId]);

  const pendingReview = evidence.filter((e) => (e.pendingSuggestions ?? 0) > 0);
  const notAnchored = evidence.filter((e) => e.version !== null && anchorState(e.version) !== "anchored");
  // Only failed/stalled anchors need a person: pending ones are still running in the background.
  const anchorNeedsAction = notAnchored.filter((e) => e.version !== null && ["failed", "stalled"].includes(anchorState(e.version)));
  const casesNeedingReview = new Set(pendingReview.map((e) => e.kase.id));

  // Actions this role can actually take: review first, then anchoring for evidence with nothing left to review.
  const attention: AttentionItem[] = [
    ...pendingReview.map((e) => ({ e, kind: "review" as const })),
    ...(canAnchor ? anchorNeedsAction.filter((e) => (e.pendingSuggestions ?? 0) === 0).map((e) => ({ e, kind: "anchor" as const })) : []),
  ];

  const cards = [
    { icon: "folder" as const, tone: { bg: "#EAF2FB", fg: "#0A66C2" }, value: cases.filter((c) => c.status.toUpperCase() === "OPEN").length, label: "Open Cases" },
    { icon: "clock" as const, tone: { bg: "#FFF3E3", fg: "#B36B00" }, value: casesNeedingReview.size, label: "Cases Needing Review" },
    { icon: "file" as const, tone: { bg: "#EEF1FA", fg: "#3B5BA9" }, value: pendingReview.length, label: "Evidence Awaiting Review" },
    { icon: "anchor" as const, tone: { bg: "#F0EDFA", fg: "#5B3FB5" }, value: notAnchored.length, label: "Awaiting Anchor" },
  ];

  const timelineCase = cases.find((c) => c.id === timelineCaseId) ?? null;
  const timeline = useMemo(() => {
    if (!timelineCase) return { events: [] as ActivityRow[], waiting: [] as Evidence[] };
    return {
      events: allEvents.filter((ev) => ev.kase.id === timelineCase.id).reverse(),
      waiting: evidence.filter((e) => e.kase.id === timelineCase.id && (e.pendingSuggestions ?? 0) > 0),
    };
  }, [allEvents, evidence, timelineCase]);

  const visibleAttention = expanded.attention ? attention : attention.slice(0, PREVIEW_ROWS);
  const visibleCases = expanded.cases ? casesByActivity : casesByActivity.slice(0, PREVIEW_ROWS);
  const versionHref = (e: Evidence) => `/dashboard/documents/${e.doc.id}/versions/${e.doc.current_version_id}`;

  return (
    <WorkspaceShell active="cases" extraCss={IO_CSS}>
      <div className="ws-title-row">
        <div>
          <h1 className="ws-title">{greeting(role)}</h1>
          <p className="ws-subtitle">{role === "ADMIN" ? "Investigation overview across all cases" : "Your investigation overview"}</p>
        </div>
        {can(role, "createCase") && <NewCaseControl onCreated={load} />}
      </div>
      {error && <p className="ws-alert" role="alert">Could not load your cases: {error}</p>}

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

      <div className="io-grid-top">
        <section className="ws-panel" aria-labelledby="io-attention-title">
          <div className="ws-panel-head">
            <div>
              <h2 id="io-attention-title" className="ws-panel-title">Needs your attention</h2>
              <p className="ws-panel-sub">Evidence you can review or anchor.</p>
            </div>
            {attention.length > PREVIEW_ROWS && (
              <button type="button" className="ws-more" onClick={() => setExpanded((x) => ({ ...x, attention: !x.attention }))}>
                {expanded.attention ? "Show less" : `View all (${attention.length})`}
              </button>
            )}
          </div>
          {loading ? (
            <p className="ws-empty">Loading…</p>
          ) : attention.length === 0 ? (
            <p className="ws-empty">You&apos;re all caught up.</p>
          ) : (
            <ul className="ws-list">
              {visibleAttention.map(({ e, kind }) => (
                <li key={`${kind}-${e.doc.id}`}>
                  <Link className="ws-row" href={versionHref(e)}>
                    <span className="ws-row-icon"><Icon name="file" /></span>
                    <span className="ws-row-main">
                      <div className="ws-row-title">{e.kase.case_number}</div>
                      <div className="ws-row-sub">{e.doc.title}</div>
                    </span>
                    <span className="ws-row-status">
                      {kind === "review" ? (
                        <>
                          <span className="ws-chip ws-chip-warn">Review required</span>
                          <span className="ws-row-note">
                            {e.pendingSuggestions} redaction suggestion{e.pendingSuggestions === 1 ? "" : "s"} waiting
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="ws-chip ws-chip-warn">{e.version && anchorState(e.version) === "failed" ? "Anchoring failed" : "Not anchored"}</span>
                          <span className="ws-row-note">Version {e.version?.version_no} · retry from the document page</span>
                        </>
                      )}
                    </span>
                    <span className="ws-chevron"><Icon name="chevron" size={18} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ws-panel" aria-labelledby="io-cases-title">
          <div className="ws-panel-head">
            <div>
              <h2 id="io-cases-title" className="ws-panel-title">Cases</h2>
              <p className="ws-panel-sub">All cases, most recent activity first.</p>
            </div>
            {casesByActivity.length > PREVIEW_ROWS && (
              <button type="button" className="ws-more" onClick={() => setExpanded((x) => ({ ...x, cases: !x.cases }))}>
                {expanded.cases ? "Show less" : `View all (${casesByActivity.length})`}
              </button>
            )}
          </div>
          {loading ? (
            <p className="ws-empty">Loading…</p>
          ) : cases.length === 0 ? (
            <p className="ws-empty">No cases yet.</p>
          ) : (
            <div className="io-cases-wrap">
            <table className="io-cases">
              <thead>
                <tr>
                  <th scope="col">Case #</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {visibleCases.map((kase) => {
                  const href = `/dashboard/cases/${kase.id}`;
                  const last = lastActivity.get(kase.id) ?? kase.created_at;
                  return (
                    <tr key={kase.id} onClick={() => router.push(href)}>
                      <td>
                        <Link href={href} onClick={(ev) => ev.stopPropagation()}>{kase.case_number}</Link>
                        <div className="io-sub">{kase.document_count} file{kase.document_count === 1 ? "" : "s"}</div>
                      </td>
                      <td className="io-hide-sm">{humanizeCode(kase.case_type)}</td>
                      <td>{caseStatusChip(kase.status)}</td>
                      <td className="ws-muted io-when" title={formatDateTime(last)}>{relativeTime(last)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </section>
      </div>

      <div className="io-grid-bottom">
        <ActivityPanel rows={allEvents.slice(0, 8)} loading={loading} />

        <section className="ws-panel" aria-labelledby="io-timeline-title">
          <div className="io-tl-head">
            <div>
              <h2 id="io-timeline-title" className="ws-panel-title">Case timeline</h2>
              <p className="ws-panel-sub">Recorded events for one case.</p>
            </div>
            {cases.length > 0 && (
              <select className="io-select" aria-label="Case for timeline" value={timelineCaseId} onChange={(e) => setTimelineCaseId(e.target.value)}>
                {casesByActivity.map((c) => (
                  <option key={c.id} value={c.id}>{c.case_number}</option>
                ))}
              </select>
            )}
          </div>
          {loading ? (
            <p className="ws-empty">Loading…</p>
          ) : !timelineCase ? (
            <p className="ws-empty">No cases yet.</p>
          ) : (
            <ol className="io-tl">
              {timeline.events.map((ev, i) => {
                const color = ev.kind === "anchor" ? "#057642" : "#0A66C2";
                return (
                  <li key={`${ev.kind}-${ev.at}-${i}`} className="io-tl-item">
                    <span className="io-tl-rail"><span className="io-tl-dot" style={{ background: color }} /><span className="io-tl-line" /></span>
                    <span className="io-tl-icon" style={{ color }}>
                      <Icon name={ev.kind === "case" ? "folder" : ev.kind === "upload" ? "upload" : ev.kind === "version" ? "version" : "anchor"} size={20} />
                    </span>
                    <span>
                      <div className="io-tl-when">{formatDateTime(ev.at)}</div>
                      <div className="io-tl-what">{ev.action}</div>
                      <div className="io-tl-detail">{ev.details}</div>
                    </span>
                  </li>
                );
              })}
              {timeline.waiting.map((e) => (
                <li key={`now-${e.doc.id}`} className="io-tl-item">
                  <span className="io-tl-rail"><span className="io-tl-dot" style={{ background: "#B36B00" }} /><span className="io-tl-line" /></span>
                  <span className="io-tl-icon" style={{ color: "#B36B00" }}><Icon name="review" size={20} /></span>
                  <span>
                    <div className="io-tl-when">Now</div>
                    <div className="io-tl-what">Awaiting redaction review</div>
                    <div className="io-tl-detail">
                      <Link href={versionHref(e)}>{e.doc.title}</Link> · {e.pendingSuggestions} suggestion{e.pendingSuggestions === 1 ? "" : "s"} waiting
                    </div>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
