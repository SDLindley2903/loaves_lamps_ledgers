-- Genesis: the members table, tenant-owned and RLS-protected (doc 04, doc 07).
-- Every tenant-owned table follows this exact shape: non-null tenant_id, RLS enabled AND forced,
-- a USING policy for reads and a WITH CHECK policy for writes.

CREATE TABLE IF NOT EXISTS members (
    id          uuid PRIMARY KEY,
    tenant_id   uuid NOT NULL REFERENCES tenants (id),
    name        text NOT NULL,
    email       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- tenant_id leads the index so RLS filtering stays cheap as the table grows (doc 07 §8).
CREATE INDEX IF NOT EXISTS members_tenant_idx ON members (tenant_id, id);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS members_tenant_isolation ON members;
CREATE POLICY members_tenant_isolation ON members
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON members TO ft_app;
