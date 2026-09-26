import { Role } from "@prisma/client";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { relyingParty, issueChallengeToken } from "@/lib/webauthn";

export const runtime = "nodejs";

const ALL_ROLES = Object.values(Role);

// POST /api/auth/webauthn/authenticate/options — assertion challenge for the logged-in user.
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const credentials = await prisma.webAuthnCredential.findMany({ where: { userId: actor.userId } });
  if (credentials.length === 0) {
    return Response.json(
      { error: "NO_CREDENTIAL", message: "No biometric credential registered for this user." },
      { status: 404 }
    );
  }

  const { rpID } = relyingParty(req);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({ id: c.credentialId })),
    userVerification: "required",
  });

  return Response.json({
    options,
    challenge_token: issueChallengeToken(actor.userId, "authenticate", options.challenge),
  });
}
