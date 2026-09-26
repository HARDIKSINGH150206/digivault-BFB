/**
 * Which roles the API accepts for each action — used ONLY to decide which
 * controls the UI shows. The server remains the only enforcement point
 * (`requireRole` in each route).
 *
 * The backend has no shared permission module to import: every route
 * declares its allowed roles inline. Each list below is a copy of one of
 * those `requireRole(...)` calls, with the file it mirrors named next to
 * it. If a route's roles change, change the matching entry here.
 */

export type Action =
  | "createCase"
  | "uploadEvidence"
  | "viewRedactionSuggestions"
  | "confirmRedactions"
  | "anchorVersion"
  | "manageShares";

const ALLOWED_ROLES: Record<Action, readonly string[]> = {
  // api/v1/cases/route.ts — POST
  createCase: ["POLICE_OFFICER", "INVESTIGATING_OFFICER", "ADMIN"],
  // api/v1/evidence/upload/route.ts — POST
  uploadEvidence: ["POLICE_OFFICER", "INVESTIGATING_OFFICER", "ADMIN"],
  // api/v1/documents/[documentId]/versions/[versionId]/redaction-suggestions/route.ts — GET
  viewRedactionSuggestions: ["POLICE_OFFICER", "INVESTIGATING_OFFICER", "ADMIN"],
  // api/v1/documents/[documentId]/versions/[versionId]/redactions/confirm/route.ts — POST
  confirmRedactions: ["POLICE_OFFICER", "INVESTIGATING_OFFICER", "ADMIN"],
  // api/v1/documents/[documentId]/versions/[versionId]/anchor/route.ts — POST
  anchorVersion: ["INVESTIGATING_OFFICER", "ADMIN"],
  // api/v1/documents/[documentId]/shares/route.ts (GET, POST) and shares/[shareId]/route.ts (DELETE)
  manageShares: ["INVESTIGATING_OFFICER", "ADMIN"],
};

export function can(role: string | undefined | null, action: Action): boolean {
  return Boolean(role) && ALLOWED_ROLES[action].includes(role as string);
}
