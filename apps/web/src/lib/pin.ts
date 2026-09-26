import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimitRetryAfter, recordAttempt, resetRateLimit } from "./rate-limit";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export type PinCheck = { ok: true } | { ok: false; response: Response };

/**
 * Re-checks a logged-in user's PIN (step-up fallback, biometric
 * enrolment). One per-user limiter covers every route that accepts a PIN,
 * so none of them can be used to brute-force it.
 */
export async function checkUserPin(userId: string, pin: unknown): Promise<PinCheck> {
  const key = `pin:${userId}`;
  const retryAfter = rateLimitRetryAfter(key, MAX_ATTEMPTS);
  if (retryAfter > 0) {
    return {
      ok: false,
      response: Response.json(
        { error: "RATE_LIMITED", message: "Too many PIN attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      ),
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pinHash || typeof pin !== "string" || !(await bcrypt.compare(pin, user.pinHash))) {
    recordAttempt(key, WINDOW_MS);
    return { ok: false, response: Response.json({ error: "UNAUTHENTICATED", message: "Incorrect PIN." }, { status: 401 }) };
  }

  resetRateLimit(key);
  return { ok: true };
}
