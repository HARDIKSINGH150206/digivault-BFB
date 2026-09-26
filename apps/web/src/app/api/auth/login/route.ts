import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueSessionToken } from "@/lib/auth";
import { clientIp } from "@/lib/request-ip";
import { rateLimitRetryAfter, recordAttempt, resetRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const INVALID = { error: "UNAUTHENTICATED", message: "Invalid service number or PIN" } as const;

// Compared against when the service number doesn't exist, so a wrong
// service number costs the same bcrypt time as a wrong PIN.
const DUMMY_HASH = bcrypt.hashSync("digivault-no-such-user", 12);

// POST /api/auth/login — { serviceNumber, pin } -> HMAC session token.
export async function POST(req: Request): Promise<Response> {
  let body: { serviceNumber?: unknown; pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "BAD_REQUEST", message: "JSON body required." }, { status: 400 });
  }
  const serviceNumber = typeof body.serviceNumber === "string" ? body.serviceNumber.trim().toUpperCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!serviceNumber || !pin) {
    return Response.json({ error: "BAD_REQUEST", message: "serviceNumber and pin are required." }, { status: 400 });
  }

  // Only failed attempts count. Per-IP limit as specified, plus a
  // per-account limit: X-Forwarded-For is spoofable without a trusted
  // proxy (see lib/request-ip.ts), so the IP limit alone can be
  // sidestepped by rotating that header.
  const ipKey = `login:ip:${clientIp(req)}`;
  const accountKey = `login:sn:${serviceNumber}`;
  const retryAfter = Math.max(
    rateLimitRetryAfter(ipKey, MAX_ATTEMPTS),
    rateLimitRetryAfter(accountKey, MAX_ATTEMPTS)
  );
  if (retryAfter > 0) {
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { serviceNumber } });
  const ok = await bcrypt.compare(pin, user?.pinHash ?? DUMMY_HASH);
  if (!user || !user.pinHash || !ok) {
    recordAttempt(ipKey, WINDOW_MS);
    recordAttempt(accountKey, WINDOW_MS);
    return Response.json(INVALID, { status: 401 });
  }

  resetRateLimit(accountKey);
  const token = issueSessionToken({ userId: user.id, role: user.role });
  return Response.json({
    token,
    user_id: user.id,
    role: user.role,
    service_number: user.serviceNumber,
    department: user.department,
  });
}
