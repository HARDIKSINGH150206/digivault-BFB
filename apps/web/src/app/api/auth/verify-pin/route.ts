import { Role } from "@prisma/client";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { issueStepUpToken, STEP_UP_HEADER } from "@/lib/step-up";
import { checkUserPin } from "@/lib/pin";

export const runtime = "nodejs";

const ALL_ROLES = Object.values(Role);

/**
 * POST /api/auth/verify-pin — { pin } -> 5-min step-up token.
 * Fallback for browsers without WebAuthn. The server can't tell whether
 * the browser really lacks WebAuthn, so this is always available; step-up
 * is therefore only as strong as the PIN.
 */
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const { pin } = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const check = await checkUserPin(actor.userId, pin);
  if (!check.ok) return check.response;

  const stepUpToken = issueStepUpToken(actor.userId, "pin");
  return Response.json({ verified: true, step_up_token: stepUpToken }, { headers: { [STEP_UP_HEADER]: stepUpToken } });
}
