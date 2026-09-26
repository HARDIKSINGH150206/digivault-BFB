"use client";

import Link from "next/link";
import { Icon, formatDateTime } from "./shell";
import { activityTime, type ActivityRow } from "./data";

/** "Recent activity" panel. Rows come from buildActivity() — record timestamps only, no audit log exists. */
export function ActivityPanel({ rows, loading, showCase = true }: { rows: ActivityRow[]; loading: boolean; showCase?: boolean }) {
  return (
    <section className="ws-panel" style={{ marginTop: 16 }} aria-labelledby="ws-activity-title">
      <div className="ws-panel-head">
        <div>
          <h2 id="ws-activity-title" className="ws-panel-title">Recent activity</h2>
          <p className="ws-panel-sub">From case, document and version records.</p>
        </div>
      </div>
      {loading ? (
        <p className="ws-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="ws-empty">No activity yet.</p>
      ) : (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Action</th>
                {showCase && <th scope="col">Case</th>}
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.kind}-${row.at}-${i}`}>
                  <td className="ws-muted" title={formatDateTime(row.at)}>{activityTime(row.at)}</td>
                  <td>
                    <span className="ws-action">
                      <span style={{ color: row.kind === "anchor" ? "#5B3FB5" : "#0A66C2", display: "flex" }}>
                        <Icon name={row.kind === "case" ? "folder" : row.kind === "upload" ? "upload" : row.kind === "version" ? "version" : "anchor"} size={18} />
                      </span>
                      {row.action}
                    </span>
                  </td>
                  {showCase && (
                    <td>
                      <Link href={`/dashboard/cases/${row.kase.id}`}>{row.kase.case_number}</Link>
                    </td>
                  )}
                  <td className="ws-muted">{row.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
