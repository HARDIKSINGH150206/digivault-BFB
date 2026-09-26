import { Role } from "@prisma/client";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { relyingParty, consumeChallengeToken } from "@/lib/webauthn";
import { issueStepUpToken, STEP_UP_HEADER } from "@/lib/step-up";
import { checkUserPin } from "@/lib/pin";
import { writeAuditLog } from "@/lib/audit";
import { clientIp } from "@/lib/request-ip";

export const runtime = "nodejs";

const ALL_ROLES = Object.values(Role);

/**
 * POST /api/auth/webauthn/register/verify — { response, challenge_token, pin }.
 * Registering requires the PIN as well as the session: otherwise anyone
 * holding a stolen session token could enrol their own fingerprint and
 * pass every step-up check. A successful registration is itself a
 * biometric + PIN check, so it returns a step-up token too.
 */
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as {
    response?: RegistrationResponseJSON;
    challenge_token?: string;
    pin?: string;
  };

  const pinCheck = await checkUserPin(actor.userId, body.pin);
  if (!pinCheck.ok) return pinCheck.response;

  const expectedChallenge = consumeChallengeToken(body.challenge_token, actor.userId, "register");
  if (!expectedChallenge || !body.response) {
    return Response.json({ error: "BAD_REQUEST", message: "Registration challenge is invalid or expired." }, { status: 400 });
  }

  const { rpID, origin } = relyingParty(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    return Response.json(
      { error: "BAD_REQUEST", message: err instanceof Error ? err.message : "Registration verification failed." },
      { status: 400 }
    );
  }
  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: "BAD_REQUEST", message: "Registration could not be verified." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  await prisma.webAuthnCredential.create({
    data: {
      userId: actor.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
    },
  });
  await prisma.user.update({ where: { id: actor.userId }, data: { mfaStatus: true } });

  await writeAuditLog({
    actorId: actor.userId,
    action: "WEBAUTHN_REGISTERED",
    targetId: actor.userId,
    targetType: "User",
    sourceIp: clientIp(req),
  });

  const stepUpToken = issueStepUpToken(actor.userId, "webauthn");
  return Response.json({ verified: true, step_up_token: stepUpToken }, { headers: { [STEP_UP_HEADER]: stepUpToken } });
}
