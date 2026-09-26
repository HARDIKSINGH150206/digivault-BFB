import { prisma } from "@/lib/prisma";
import { issueSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * DEV-ONLY. No real login flow exists yet (step 6 — frontend — builds
 * that; CLAUDE.md rules out production Aadhaar login entirely). This
 * issues a session token for an EXISTING User row by id, purely so RBAC
 * middleware has something real to test against before step 6 lands.
 * Must not ship as-is: anyone who can call this can become any user.
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { user_id } = (await req.json()) as { user_id?: string };
  if (!user_id) {
    return Response.json({ error: "BAD_REQUEST", message: "user_id required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: user_id } });
  if (!user) {
    return Response.json({ error: "NOT_FOUND", message: "No such user." }, { status: 404 });
  }

  const token = issueSessionToken({ userId: user.id, role: user.role });
  return Response.json({ token, user_id: user.id, role: user.role });
}
