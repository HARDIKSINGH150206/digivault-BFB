/**
 * BNSS s.193(2) investigation deadline (docs/07 Phase 7, ADR-032).
 *
 * For the listed offences, the investigation must be completed within two
 * months from the date the information was recorded by the officer in
 * charge (Case.firRegisteredAt). It applies only to BNS ss.64, 65, 66, 67,
 * 68, 70, 71 and POCSO ss.4, 6, 8, 10 — not every offence against women and
 * not all of POCSO.
 *
 * Days are whole calendar days in India time, counted from the day after
 * the registration date (General Clauses Act s.9: the first day is
 * excluded). The due date is the EARLIER of +60 days and +2 calendar months
 * (a two-month period is 59–62 days), so the badge never says "on time"
 * when the statute already says late.
 *
 * Pure (no Prisma, no server imports): the API computes it, tests cover it.
 */

export const COVERED_SECTIONS: Readonly<Record<"BNS" | "POCSO", readonly number[]>> = {
  BNS: [64, 65, 66, 67, 68, 70, 71],
  POCSO: [4, 6, 8, 10],
};

export const AMBER_FROM_DAY = 45;
export const RED_FROM_DAY = 55;
export const DEADLINE_DAYS = 60;

export type DeadlineLevel = "on_track" | "amber" | "red" | "overdue";

export interface BnssDeadline {
  /** The offence sections that bring the case under s.193(2), as entered. */
  coveredSections: string[];
  /** Registration date in India time, YYYY-MM-DD. */
  registeredOn: string;
  /** Last day for completing the investigation, YYYY-MM-DD. */
  dueOn: string;
  /** Days since registration (0 on the registration day). */
  day: number;
  /** Days until dueOn; 0 on the due day, negative once overdue. */
  daysLeft: number;
  level: DeadlineLevel;
  /** Short badge text, e.g. "Day 50 of 60" or "Overdue by 3 days". */
  label: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "BNS 64", "BNS s.64(1)", "Section 70(2) BNS", "POCSO Act sec 4" -> { act, section }. */
export function parseSection(raw: string): { act: "BNS" | "POCSO"; section: number } | null {
  const s = raw.toUpperCase().replace(/[,;]/g, " ");
  const act = /\bPOCSO\b/.test(s) ? "POCSO" : /\bBNS\b|BHARATIYA\s+NYAYA\s+SANHITA/.test(s) ? "BNS" : null;
  if (!act) return null;
  // The first section number, ignoring sub-section brackets and the act's year.
  const withoutYear = s.replace(/\b(19|20)\d{2}\b/g, " ");
  const m = withoutYear.match(/(?:^|[^\d(])(\d{1,3})(?:\s*\([^)]*\))*/);
  return m ? { act, section: Number(m[1]) } : null;
}

/**
 * Free text or a list -> one entry per section. "BNS 64, 74; POCSO 4" ->
 * ["BNS 64", "BNS 74", "POCSO 4"]: a bare number takes the act before it.
 * Throws on more than 20 entries or one longer than 60 characters.
 */
export function normalizeSections(input: string | readonly string[]): string[] {
  const parts = (typeof input === "string" ? [input] : input)
    .flatMap((x) => String(x).split(/[,;\n]+/))
    .map((x) => x.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const out: string[] = [];
  let lastAct: string | null = null;
  for (const part of parts) {
    if (part.length > 60) throw new Error(`Offence section too long: "${part.slice(0, 20)}…"`);
    const act = /\bPOCSO\b/i.test(part) ? "POCSO" : /\bBNS\b|BHARATIYA\s+NYAYA/i.test(part) ? "BNS" : /^[a-z]/i.test(part.replace(/^(s|sec|section)\.?\s*/i, "")) ? "" : null;
    if (act) lastAct = act;
    else if (act === "") lastAct = null;
    const entry = act === null && lastAct ? `${lastAct} ${part}` : part;
    if (!out.includes(entry)) out.push(entry);
  }
  if (out.length > 20) throw new Error("At most 20 offence sections.");
  return out;
}

export function coveredSections(sections: readonly string[]): string[] {
  return sections.filter((raw) => {
    const p = parseSection(raw);
    return p !== null && COVERED_SECTIONS[p.act].includes(p.section);
  });
}

/** Calendar day number (days since epoch) of an instant, in India time. */
function istDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

function dayNumberToIso(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** +2 calendar months, clamped to the month's last day (31 Dec -> 28/29 Feb). */
function addTwoMonths(dayNumber: number): number {
  const d = new Date(dayNumber * DAY_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 2;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)) / DAY_MS);
}

/**
 * The deadline for a case, or null when s.193(2) doesn't apply to it: no
 * registration date, no covered section, or the case is closed (the
 * investigation is over).
 */
export function bnssDeadline(
  kase: { firRegisteredAt: Date | null; offenceSections: readonly string[]; status: string },
  now: Date = new Date()
): BnssDeadline | null {
  if (!kase.firRegisteredAt || kase.status.toUpperCase() === "CLOSED") return null;
  const covered = coveredSections(kase.offenceSections);
  if (covered.length === 0) return null;

  const registered = istDayNumber(kase.firRegisteredAt);
  const today = istDayNumber(now);
  const due = Math.min(registered + DEADLINE_DAYS, addTwoMonths(registered));
  const day = today - registered;
  const daysLeft = due - today;

  const level: DeadlineLevel = daysLeft <= 0 ? "overdue" : day >= RED_FROM_DAY ? "red" : day >= AMBER_FROM_DAY ? "amber" : "on_track";
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const label = daysLeft < 0 ? `Overdue by ${plural(-daysLeft)}` : daysLeft === 0 ? "Due today" : `Day ${Math.max(day, 0)} of ${due - registered}`;

  return { coveredSections: covered, registeredOn: dayNumberToIso(registered), dueOn: dayNumberToIso(due), day, daysLeft, level, label };
}

/** API shape (snake_case, like the rest of /api/v1). */
export function deadlineJson(d: BnssDeadline | null) {
  return d
    ? {
        covered_sections: d.coveredSections,
        registered_on: d.registeredOn,
        due_on: d.dueOn,
        day: d.day,
        days_left: d.daysLeft,
        level: d.level,
        label: d.label,
      }
    : null;
}
