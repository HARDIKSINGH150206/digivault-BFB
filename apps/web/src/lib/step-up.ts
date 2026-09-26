import { issueScopedToken, verifyScopedToken, type SessionActor } from "./auth";
import { RbacError } from "./rbac";

export const STEP_UP_HEADER = "X-StepUp-Token";
const STEP_UP_TTL_SECONDS = 5 * 60;

/** Proof that `userId` just passed a biometric (or PIN fallback) check. */
export function issueStepUpToken(userId: string, method: "webauthn" | "pin"): string {
  return issueScopedToken("stepup", { u: userId, m: method }, STEP_UP_TTL_SECONDS);
}

/**
 * Gate for high-stakes routes (anchor, confirm redaction, certificate).
 * Call after requireRole; the token must belong to the same user as the
 * session, so a step-up token can't be lifted onto someone else's session.
 */
export function requireStepUp(req: Request, actor: SessionActor): void {
  const token = req.headers.get(STEP_UP_HEADER);
  if (!token) {
    throw new RbacError(401, "STEP_UP_REQUIRED", `Missing ${STEP_UP_HEADER} header. Verify your identity first.`);
  }
  const claims = verifyScopedToken("stepup", token);
  if (!claims || claims.u !== actor.userId) {
    throw new RbacError(401, "STEP_UP_REQUIRED", "Step-up token is invalid or expired. Verify your identity again.");
  }
}
