-- =============================================================================
-- Row-Level Security: the structural tenant-isolation control (doc 04 §2).
--
-- WHY this is the linchpin: it moves the isolation guarantee BELOW the application, into the database,
-- where a forgotten `WHERE tenant_id = ?` cannot defeat it. The application role cannot bypass RLS;
-- only migration/ops roles can. So even a SQL bug (or SQL injection) in application code cannot return
-- another tenant's rows. This file is the reference migration; a runnable integration test
-- (rls.integration.test.ts) exercises it against a real Postgres when one is available.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Roles: application connections use a role that CANNOT bypass RLS.
-- (Created by ops/migration, not by the app. Shown here for completeness.)
-- ----------------------------------------------------------------------------
--   CREATE ROLE ft_app        LOGIN NOBYPASSRLS;   -- application runtime
--   CREATE ROLE ft_migrator   LOGIN NOBYPASSRLS;   -- migrations (still not bypass)
-- The superuser / owner is used only for break-glass and is never the app connection.

-- ----------------------------------------------------------------------------
-- Example tenant-owned table. EVERY tenant-owned table follows this shape:
--   * a non-null tenant_id, foreign-keyed to tenants(id)
--   * RLS enabled AND forced (so even the table owner is subject to policy)
--   * a USING policy for reads and a WITH CHECK policy for writes
-- CI rejects any migration that adds a tenant-owned table without tenant_id + RLS (doc 04/13).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id          uuid PRIMARY KEY,
    tenant_id   uuid NOT NULL REFERENCES tenants (id),
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- tenant_id leads the primary access index so RLS filtering is cheap at scale (doc 07 §8).
CREATE INDEX IF NOT EXISTS members_tenant_idx ON members (tenant_id, id);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

-- The policy reads the per-connection GUC `app.tenant_id`, set by the tenancy middleware at the start
-- of each request/job (doc 04 §2), inside the transaction, before any product query runs.
DROP POLICY IF EXISTS members_tenant_isolation ON members;
CREATE POLICY members_tenant_isolation ON members
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Usage at runtime (per request/job), issued by the platform, never by product code:
--   SET LOCAL app.tenant_id = '<uuid>';
--   -- ... all subsequent queries in this transaction are transparently tenant-scoped ...
--
-- Note: current_setting(..., true) returns NULL when unset; comparing tenant_id = NULL yields no rows,
-- so a query that runs WITHOUT a tenant scope returns nothing (fails closed) rather than leaking.
