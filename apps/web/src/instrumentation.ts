/**
 * Next.js server startup hook (experimental.instrumentationHook in
 * next.config.mjs). Starts the 6-hourly audit-head anchor (docs/07 Phase 4,
 * lib/audit-anchor.ts) in the Node.js runtime only. The import must sit
 * inside this exact NEXT_RUNTIME check so the edge bundle drops it (sharp,
 * minio and Prisma can't load there).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAuditAnchorSchedule } = await import("./lib/audit-anchor");
    startAuditAnchorSchedule();
  }
}
