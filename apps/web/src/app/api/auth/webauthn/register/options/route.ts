import { Role } from "@prisma/client";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireRole, RbacError, rbacErrorResponse } from "@/lib/rbac";
import { relyingParty, issueChallengeToken } from "@/lib/webauthn";

export const runtime = "nodejs";

const ALL_ROLES = Object.values(Role);

// POST /api/auth/webauthn/register/options — registration options for the logged-in user.
export async function POST(req: Request): Promise<Response> {
  let actor;
  try {
    actor = requireRole(req, ALL_ROLES);
  } catch (err) {
    if (err instanceof RbacError) return rbacErrorResponse(err);
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    include: { webauthnCredentials: true },
  });
  if (!user) return Response.json({ error: "NOT_FOUND", message: "User not found." }, { status: 404 });

  const { rpID, rpName } = relyingParty(req);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.serviceNumber ?? user.authIdentity,
    userDisplayName: `${user.serviceNumber ?? user.authIdentity} (${user.role})`,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  return Response.json({
    options,
    challenge_token: issueChallengeToken(user.id, "register", options.challenge),
  });
}
