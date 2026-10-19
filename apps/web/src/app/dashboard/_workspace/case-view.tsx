"use client";

/**
 * Case detail in the workspace design (POLICE_OFFICER / FORENSIC_LAB).
 * Same route and data as the existing case page:
 *   GET /api/v1/cases/{caseId}                -> case header + details
 *   loadEvidence() for this one case          -> documents, version/anchor state, pending review
 * "Upload document" links to the existing upload route and is shown only to
 * roles the upload API accepts.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson, ApiError } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon, caseStatusChip, formatDate } from "./shell";
import { loadEvidence, buildActivity, humanizeCode, type CaseRow, type Evidence } from "./data";
import { ActivityPanel } from "./activity-table";
import { EvidenceRow } from "../workspace-dashboard";
import { DeadlineChip, deadlineSentence, formatDay, needsDeadlineAlert } from "./deadline";

/* Same rule as the other pages: no quote, ampersand or angle-bracket characters inside this CSS. */
const CASE_CSS = `
.cv-deadline { margin: 20px 0 0; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--warn); color: var(--warn); font-size: 14px; }
.cv-deadline-red, .cv-deadline-overdue { border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger); }
.cv-fir-form { display: grid; gap: 10px; margin-top: 14px; }
.cv-fir-form label { display: grid; gap: 6px; font-size: 13px; font-weight: 500; color: var(--paper-2); }
.cv-fir-actions { display: flex; gap: 10px; flex-wrap: wrap; }
`;

/** ISO instant -> its calendar date in India time (the date input value). */
function istDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function deadlineDetail(kase: CaseRow): string {
  if (kase.bnss_deadline) return `Due ${formatDay(kase.bnss_deadline.due_on)}`;
  if (kase.status.toUpperCase() === "CLOSED") return "Not tracked: case closed";
  if (!kase.fir_registered_at) return "Not tracked: no FIR registration date";
  return "Does not apply to these sections";
}

/** FIR registration date and offence sections, which drive the BNSS s.193(2) deadline (PATCH /api/v1/cases/{id}). */
function FirDetailsForm({ kase, onSaved, onCancel }: { kase: CaseRow; onSaved: (c: CaseRow) => void; onCancel: () => void }) {
  const [date, setDate] = useState(kase.fir_registered_at ? istDate(kase.fir_registered_at) : "");
  const [sections, setSections] = useState(kase.offence_sections.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await apiJson<CaseRow>(`/api/v1/cases/${kase.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fir_registered_at: date || null, offence_sections: sections }),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the FIR details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cv-fir-form" onSubmit={save} aria-label="FIR details">
      <label>
        FIR registered on
        <input className="ws-input" type="date" max={istDate(new Date().toISOString())} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Offence sections
        <input className="ws-input" placeholder="e.g. BNS 64, 74; POCSO 4" value={sections} onChange={(e) => setSections(e.target.value)} />
      </label>
      <div className="cv-fir-actions">
        <button type="submit" className="ws-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="ws-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      {error && <p className="ws-alert" role="alert">{error}</p>}
    </form>
  );
}

export function WorkspaceCaseView() {
  const { caseId } = useParams<{ caseId: string }>();
  const { session } = useAuth();
  const role = session?.role ?? "";
  const canViewSuggestions = can(role, "viewRedactionSuggestions");

  const [kase, setKase] = useState<CaseRow | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFir, setEditingFir] = useState(false);

  useEffect(() => {
    apiJson<CaseRow>(`/api/v1/cases/${caseId}`)
      .then(async (c) => {
        setKase(c);
        setEvidence(await loadEvidence([c], canViewSuggestions));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this case."))
      .finally(() => setLoading(false));
  }, [caseId, canViewSuggestions]);

  const activity = useMemo(() => (kase ? buildActivity([kase], evidence, 12) : []), [kase, evidence]);

  return (
    <WorkspaceShell active="cases" extraCss={CASE_CSS}>
      <Link href="/dashboard" className="ws-crumb">
        <Icon name="back" size={18} /> Cases
      </Link>

      {error && <p className="ws-alert" role="alert">{error}</p>}

      {kase && (
        <>
          <div className="ws-title-row">
            <div>
              <h1 className="ws-title">{kase.case_number}</h1>
              <div className="ws-meta-line">
                {caseStatusChip(kase.status)}
                <span>{humanizeCode(kase.case_type)}</span>
                <span aria-hidden="true">·</span>
                <span>{kase.department}</span>
                <span aria-hidden="true">·</span>
                <span>Opened {formatDate(kase.created_at)}</span>
                <DeadlineChip deadline={kase.bnss_deadline} />
              </div>
            </div>
            {can(role, "uploadEvidence") && (
              <Link href={`/dashboard/cases/${kase.id}/upload`} className="ws-primary">
                <Icon name="upload" size={18} /> Upload document
              </Link>
            )}
          </div>

          {needsDeadlineAlert(kase.bnss_deadline) && (
            <p className={`cv-deadline cv-deadline-${kase.bnss_deadline.level}`} role="alert" data-testid="bnss-deadline-alert">
              {deadlineSentence(kase.bnss_deadline)} Offences: {kase.bnss_deadline.covered_sections.join(", ")}.
            </p>
          )}

          <div className="ws-grid" style={{ marginTop: 24 }}>
            <section className="ws-panel" aria-labelledby="ws-evidence-title">
              <div className="ws-panel-head">
                <div>
                  <h2 id="ws-evidence-title" className="ws-panel-title">Evidence</h2>
                  <p className="ws-panel-sub">Documents in this case, newest first.</p>
                </div>
              </div>
              {loading ? (
                <p className="ws-empty">Loading…</p>
              ) : evidence.length === 0 ? (
                <p className="ws-empty">No documents in this case yet.</p>
              ) : (
                <ul className="ws-list">
                  {evidence.map((e) => (
                    <li key={e.doc.id}>
                      <EvidenceRow e={e} showReview={canViewSuggestions} showCase={false} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ws-panel ws-panel-pad" aria-labelledby="ws-details-title">
              <h2 id="ws-details-title" className="ws-panel-title">Details</h2>
              <dl className="ws-dl">
                <dt>Case number</dt>
                <dd>{kase.case_number}</dd>
                <dt>Type</dt>
                <dd>{humanizeCode(kase.case_type)}</dd>
                <dt>Status</dt>
                <dd>{humanizeCode(kase.status)}</dd>
                <dt>Department</dt>
                <dd>{kase.department}</dd>
                <dt>Opened</dt>
                <dd>{formatDate(kase.created_at)}</dd>
                <dt>Documents</dt>
                <dd>{kase.document_count}</dd>
                <dt>FIR registered</dt>
                <dd>{kase.fir_registered_at ? formatDate(kase.fir_registered_at) : "Not recorded"}</dd>
                <dt>Offence sections</dt>
                <dd>{kase.offence_sections.length ? kase.offence_sections.join(", ") : "None recorded"}</dd>
                <dt>BNSS s.193(2)</dt>
                <dd>{deadlineDetail(kase)}</dd>
              </dl>
              {can(role, "createCase") &&
                (editingFir ? (
                  <FirDetailsForm
                    kase={kase}
                    onSaved={(c) => {
                      setKase(c);
                      setEditingFir(false);
                    }}
                    onCancel={() => setEditingFir(false)}
                  />
                ) : (
                  <button type="button" className="ws-secondary" style={{ marginTop: 14 }} onClick={() => setEditingFir(true)}>
                    Edit FIR details
                  </button>
                ))}
            </section>
          </div>

          <ActivityPanel rows={activity} loading={loading} showCase={false} />
        </>
      )}

      {loading && !kase && !error && <p className="ws-empty">Loading…</p>}
    </WorkspaceShell>
  );
}
