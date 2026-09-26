import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * DEV-ONLY, same placeholder-auth caveat as /api/auth/dev-login (see that
 * route's comment). Lets the login screen show a real, human-pickable list
 * instead of asking someone to paste a raw user id. Not part of
 * docs/04-api-spec.md — that doc doesn't cover user/case management at
 * all, only the evidence lifecycle. Filling a gap step 4/5 didn't need to.
 */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    orderBy: { role: "asc" },
    select: { id: true, role: true, department: true, authIdentity: true },
  });

  return Response.json({ users });
}
