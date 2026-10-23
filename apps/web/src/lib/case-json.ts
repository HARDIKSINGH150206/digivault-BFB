import type { Case } from "@prisma/client";
import { bnssDeadline, deadlineJson, normalizeSections } from "./bnss-deadline";

/** One case as /api/v1/cases returns it, with its BNSS s.193(2) deadline (docs/07 Phase 7). */
export function caseJson(kase: Case, documentCount?: number, now: Date = new Date()) {
  return {
    id: kase.id,
    case_number: kase.caseNumber,
    case_type: kase.caseType,
    status: kase.status,
    department: kase.department,
    ...(documentCount !== undefined ? { document_count: documentCount } : {}),
    created_at: kase.createdAt.toISOString(),
    fir_registered_at: kase.firRegisteredAt?.toISOString() ?? null,
    offence_sections: kase.offenceSections,
    bnss_deadline: deadlineJson(bnssDeadline(kase, now)),
  };
}

export class CaseFieldError extends Error {}

/**
 * fir_registered_at: "YYYY-MM-DD" (taken as midnight India time) or a full
 * ISO timestamp; null clears it. Not in the future.
 */
export function parseFirRegisteredAt(value: unknown, now: Date = new Date()): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new CaseFieldError("fir_registered_at must be a date string.");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
  if (Number.isNaN(d.getTime())) throw new CaseFieldError("fir_registered_at is not a valid date.");
  if (d.getTime() > now.getTime() + 60_000) throw new CaseFieldError("fir_registered_at cannot be in the future.");
  return d;
}

export function parseOffenceSections(value: unknown): string[] {
  if (typeof value !== "string" && !(Array.isArray(value) && value.every((v) => typeof v === "string"))) {
    throw new CaseFieldError("offence_sections must be a string or a list of strings.");
  }
  try {
    return normalizeSections(value);
  } catch (err) {
    throw new CaseFieldError(err instanceof Error ? err.message : String(err));
  }
}
