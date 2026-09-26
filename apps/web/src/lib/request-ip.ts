import { isIP } from "node:net";

/**
 * Best-effort client IP for audit logging and rate limiting.
 *
 * Route handlers can't see the socket address directly; Next only fills
 * X-Forwarded-For with it when the header is absent (base-server.js uses
 * `??=`), so with no proxy in front a client can put anything there.
 *
 * - DIGIVAULT_TRUST_PROXY=true: a reverse proxy we control rewrites XFF,
 *   so the first entry is the real client.
 * - Otherwise: take the last entry, i.e. the hop closest to this server.
 *   That is the socket address when the client sent no XFF, and at worst
 *   the same spoofable value as the first entry when it did.
 */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/** Same as clientIp, for server components that only have next/headers. */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  const hops = xff
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hops.length === 0) return "unknown";

  const candidate = process.env.DIGIVAULT_TRUST_PROXY === "true" ? hops[0] : hops[hops.length - 1];
  return isIP(candidate) ? candidate : "unknown";
}
