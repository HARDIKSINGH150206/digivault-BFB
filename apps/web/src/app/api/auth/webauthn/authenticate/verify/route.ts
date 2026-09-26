import { Role } from "@prisma/client";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { relyingParty, consumeChallengeToken } from "@/lib/webauthn";
import { issueStepUpToken, STEP_UP_HEADER } from "@/lib/step-up";

export const runtime = "nodejs";

const ALL_ROLES = Object.values(Role);

// POST /api/auth/webauthn/authenticate/verify — { response, challenge_token } -> 5-min step-up token.
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as {
    response?: AuthenticationResponseJSON;
    challenge_token?: string;
  };

  const expectedChallenge = consumeChallengeToken(body.challenge_token, actor.userId, "authenticate");
  if (!expectedChallenge || !body.response) {
    return Response.json({ error: "BAD_REQUEST", message: "Authentication challenge is invalid or expired." }, { status: 400 });
  }

  // Scoped to the session's user: a credential registered by someone else
  // can't satisfy this user's step-up.
  const stored = await prisma.webAuthnCredential.findFirst({
    where: { credentialId: body.response.id, userId: actor.userId },
  });
  if (!stored) {
    return Response.json({ error: "UNAUTHENTICATED", message: "Unknown credential for this user." }, { status: 401 });
  }

  const { rpID, origin } = relyingParty(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
      },
    });
  } catch (err) {
    return Response.json(
      { error: "UNAUTHENTICATED", message: err instanceof Error ? err.message : "Verification failed." },
      { status: 401 }
    );
  }
  if (!verification.verified) {
    return Response.json({ error: "UNAUTHENTICATED", message: "Verification failed." }, { status: 401 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  const stepUpToken = issueStepUpToken(actor.userId, "webauthn");
  return Response.json({ verified: true, step_up_token: stepUpToken }, { headers: { [STEP_UP_HEADER]: stepUpToken } });
}
