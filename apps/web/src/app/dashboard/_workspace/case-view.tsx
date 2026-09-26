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
import { apiJson } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon, caseStatusChip, formatDate } from "./shell";
import { loadEvidence, buildActivity, humanizeCode, type CaseRow, type Evidence } from "./data";
import { ActivityPanel } from "./activity-table";
import { EvidenceRow } from "../workspace-dashboard";

export function WorkspaceCaseView() {
  const { caseId } = useParams<{ caseId: string }>();
  const { session } = useAuth();
  const role = session?.role ?? "";
  const canViewSuggestions = can(role, "viewRedactionSuggestions");

  const [kase, setKase] = useState<CaseRow | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <WorkspaceShell active="cases">
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
              </div>
            </div>
            {can(role, "uploadEvidence") && (
              <Link href={`/dashboard/cases/${kase.id}/upload`} className="ws-primary">
                <Icon name="upload" size={18} /> Upload document
              </Link>
            )}
          </div>

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
              </dl>
            </section>
          </div>

          <ActivityPanel rows={activity} loading={loading} showCase={false} />
        </>
      )}

      {loading && !kase && !error && <p className="ws-empty">Loading…</p>}
    </WorkspaceShell>
  );
}
