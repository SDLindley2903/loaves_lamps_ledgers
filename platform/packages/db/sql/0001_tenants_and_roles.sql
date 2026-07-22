-- Platform baseline: the tenants table and the application role (doc 04, doc 07, doc 11).

CREATE TABLE IF NOT EXISTS tenants (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- The application connects as a role that CANNOT bypass RLS. This is the property that makes
-- Row-Level Security a real isolation boundary rather than advisory: even a SQL bug or injection in
-- application code cannot escape the tenant scope, because the role itself lacks BYPASSRLS (doc 04 §2).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ft_app') THEN
        CREATE ROLE ft_app LOGIN PASSWORD 'ft_app_local_dev' NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ft_app;
GRANT SELECT ON tenants TO ft_app;
-- The application manages migrations under an admin connection; ft_app only reads tenants (for FK/context).
