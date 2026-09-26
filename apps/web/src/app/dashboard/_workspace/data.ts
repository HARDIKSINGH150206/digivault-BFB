/**
 * Data loading for the workspace pages. Only existing API routes are called:
 *   GET /api/v1/cases/{caseId}/documents
 *   GET /api/v1/documents/{d}/versions/{v}
 *   GET /api/v1/documents/{d}/versions/{v}/redaction-suggestions  (only when the role may read it)
 * Nothing here invents or defaults a value; missing data stays missing.
 */

import { apiJson } from "@/lib/client/api-client";

/** "SEXUAL_ASSAULT" -> "Sexual assault" for display; codes without underscores ("FIR", "OPEN") only get sentence case when all caps and longer than 3 letters. The stored value is unchanged. */
export function humanizeCode(code: string): string {
  if (!code.includes("_") && (code.length <= 3 || code !== code.toUpperCase())) return code;
  const words = code.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface CaseRow {
  id: string;
  case_number: string;
  case_type: string;
  status: string;
  department: string;
  document_count: number;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  doc_type: string;
  source_type: string;
  current_version_id: string | null;
  latest_version_no: number | null;
  created_at: string;
}

export interface AnchorInfo {
  status: "PENDING" | "ANCHORED" | "FAILED";
  error_message: string | null;
  object_lock_uri: string;
  polygon_tx_hash: string | null;
  anchored_at: string;
}

export interface VersionSummary {
  version_no: number;
  created_at: string;
  is_redacted: boolean;
  anchor: AnchorInfo | null;
}

/** Same rule as the backend's "stale PENDING" handling: anchoring runs in the background after upload/confirm. */
export const STALE_PENDING_MS = 2 * 60 * 1000;

export type AnchorState = "anchored" | "pending" | "failed" | "stalled";

/**
 * anchored: status ANCHORED with a Polygon tx.  failed: status FAILED.
 * pending: background anchoring still plausibly running (< 2 min).
 * stalled: no anchor, or PENDING for longer than that — it will not finish on its own.
 */
export function anchorState(version: { created_at: string; anchor: AnchorInfo | null }): AnchorState {
  const a = version.anchor;
  if (a?.status === "ANCHORED" && a.polygon_tx_hash) return "anchored";
  if (a?.status === "FAILED") return "failed";
  const startedAt = new Date(a?.anchored_at ?? version.created_at).getTime();
  return Date.now() - startedAt < STALE_PENDING_MS ? "pending" : "stalled";
}

export interface Evidence {
  doc: DocumentRow;
  kase: CaseRow;
  version: VersionSummary | null;
  /** Unconfirmed suggestions on the current version; null when this role can't read suggestions. */
  pendingSuggestions: number | null;
}

export interface ActivityRow {
  at: string;
  kind: "case" | "upload" | "version" | "anchor";
  action: string;
  kase: CaseRow;
  details: string;
}

export async function loadEvidence(cases: CaseRow[], canViewSuggestions: boolean): Promise<Evidence[]> {
  const perCase = await Promise.all(
    cases.map((kase) =>
      apiJson<{ documents: DocumentRow[] }>(`/api/v1/cases/${kase.id}/documents`).then((b) => b.documents.map((doc) => ({ doc, kase })))
    )
  );
  const enriched = await Promise.all(
    perCase.flat().map(async ({ doc, kase }): Promise<Evidence> => {
      if (!doc.current_version_id) return { doc, kase, version: null, pendingSuggestions: null };
      const base = `/api/v1/documents/${doc.id}/versions/${doc.current_version_id}`;
      const [version, suggestions] = await Promise.all([
        apiJson<VersionSummary>(base),
        canViewSuggestions ? apiJson<{ suggestions: { masked: boolean }[] }>(`${base}/redaction-suggestions`) : Promise.resolve(null),
      ]);
      return { doc, kase, version, pendingSuggestions: suggestions ? suggestions.suggestions.filter((s) => !s.masked).length : null };
    })
  );
  return enriched.sort((a, b) => new Date(b.doc.created_at).getTime() - new Date(a.doc.created_at).getTime());
}

/** Timeline built only from timestamps already on case, document, version and anchor records (there is no audit-log endpoint). */
export function buildActivity(cases: CaseRow[], evidence: Evidence[], limit = 8): ActivityRow[] {
  const rows: ActivityRow[] = cases.map((kase) => ({ at: kase.created_at, kind: "case", action: "Case opened", kase, details: `${humanizeCode(kase.case_type)} · ${kase.department}` }));
  for (const e of evidence) {
    rows.push({ at: e.doc.created_at, kind: "upload", action: "Evidence uploaded", kase: e.kase, details: e.doc.title });
    if (e.version && e.version.version_no > 1) {
      rows.push({ at: e.version.created_at, kind: "version", action: "New version created", kase: e.kase, details: `${e.doc.title} · Version ${e.version.version_no}` });
    }
    if (e.version && e.version.anchor && anchorState(e.version) === "anchored") {
      rows.push({ at: e.version.anchor.anchored_at, kind: "anchor", action: "Evidence anchored", kase: e.kase, details: `${e.doc.title} · Version ${e.version.version_no}` });
    }
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}

export function activityTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
