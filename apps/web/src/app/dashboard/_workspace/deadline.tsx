/**
 * BNSS s.193(2) deadline badge (docs/07 Phase 7). The server computes the
 * deadline (lib/bnss-deadline.ts) and returns it as `bnss_deadline` on every
 * case; null means the rule doesn't apply, and then nothing is shown.
 */

export interface BnssDeadlineJson {
  covered_sections: string[];
  registered_on: string;
  due_on: string;
  day: number;
  days_left: number;
  level: "on_track" | "amber" | "red" | "overdue";
  label: string;
}

/** "2026-10-29" -> "29 Oct 2026", without shifting the day in the viewer's time zone. */
export function formatDay(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Amber from day 45, red from day 55, overdue from the due date. */
export function needsDeadlineAlert(d: BnssDeadlineJson | null | undefined): d is BnssDeadlineJson {
  return Boolean(d && d.level !== "on_track");
}

export function deadlineSentence(d: BnssDeadlineJson): string {
  const due = formatDay(d.due_on);
  if (d.days_left < 0) return `Investigation deadline passed on ${due} (BNSS s.193(2)).`;
  if (d.days_left === 0) return `Investigation must be completed today, ${due} (BNSS s.193(2)).`;
  return `Investigation must be completed by ${due}: ${d.days_left} day${d.days_left === 1 ? "" : "s"} left (BNSS s.193(2)).`;
}

/** One line for list rows: "Due 29 Oct 2026 · 10 days left". */
export function deadlineShort(d: BnssDeadlineJson): string {
  const due = formatDay(d.due_on);
  if (d.days_left < 0) return `Was due ${due}`;
  if (d.days_left === 0) return `Due today, ${due}`;
  return `Due ${due} · ${d.days_left} day${d.days_left === 1 ? "" : "s"} left`;
}

export function DeadlineChip({ deadline }: { deadline: BnssDeadlineJson | null | undefined }) {
  if (!deadline) return null;
  return (
    <span
      className={`ws-chip ws-deadline ws-deadline-${deadline.level}`}
      title={`BNSS s.193(2), ${deadline.covered_sections.join(", ")}: due ${formatDay(deadline.due_on)}`}
      data-testid="bnss-deadline"
      data-level={deadline.level}
    >
      BNSS {deadline.label}
    </span>
  );
}
