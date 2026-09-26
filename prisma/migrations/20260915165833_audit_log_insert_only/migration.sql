-- Structural (not just application-layer) enforcement that AuditLog is
-- insert-only. This project's insider-threat story requires that a
-- corrupt admin with API access — or even direct DB credentials for the
-- role the running app actually uses — cannot alter or erase audit
-- history. The app layer already exposes no update/delete route for
-- AuditLog; this migration additionally creates a dedicated, non-owner,
-- non-superuser role for the app to connect as at runtime, and explicitly
-- revokes UPDATE/DELETE on AuditLog from it. Schema migrations
-- (prisma migrate) keep running as the original superuser role, which
-- still owns every table — this REVOKE only restricts the day-to-day
-- application connection, which is the one that matters for the threat
-- model.
--
-- Password below is a dev-only placeholder — rotate it before this ever
-- runs anywhere beyond a local/demo Postgres instance.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'digivault_app') THEN
    CREATE ROLE digivault_app LOGIN PASSWORD '3d23ba0ddbacf6e0a44888a2bc6829cc';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO digivault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO digivault_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO digivault_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO digivault_app;

-- The actual insert-only guarantee: digivault_app can INSERT/SELECT on
-- AuditLog, but UPDATE and DELETE are structurally unavailable to it.
REVOKE UPDATE, DELETE ON "AuditLog" FROM digivault_app;
