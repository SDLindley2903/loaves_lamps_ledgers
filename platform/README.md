# Faith Trail Systems — Platform Backend

This is the shared enterprise platform every FTS product builds on, implemented per the architecture
in [`../docs/architecture`](../docs/architecture). It is a **pnpm + TypeScript monorepo** (doc 16),
built as a modular set of packages with hard boundaries (doc 01).

> **Status: foundation increment.** This first slice implements the platform's **core invariants** —
> the pieces every product and every later feature depend on and that are catastrophic to get wrong:
> tenant isolation (doc 04), authorization (doc 03), immutable audit (doc 06), and the shared security
> context (docs 02/11). Everything here is covered by tests that *prove* the invariants hold.

## Packages

| Package | Responsibility | Architecture doc |
|---|---|---|
| `@ft/core` | Security context, typed errors (fail-closed), IDs (UUIDv7), data classification | 02, 11, 07 |
| `@ft/authorization` | RBAC + ABAC `can()` engine, deny-by-default, role inheritance | 03 |
| `@ft/tenancy` | Tenant context, tenant-scoped data access, cross-tenant guard, RLS policy | 04 |
| `@ft/audit` | Append-only, hash-chained, tamper-evident audit log + verification | 06 |
| `@ft/identity` | Password hashing/policy, MFA (TOTP + recovery codes), access tokens, sessions | 02 |
| `@ft/api` | The shared request kernel: authn → tenancy → authz → audit → handler, RFC 9457 errors, idempotency | 08, 01 |
| `@ft/db` | PostgreSQL access bound to tenant scope (enforces RLS) + migration runner | 04, 07 |

Products (`products/*`) are thin applications on top of the platform:

| Product | Responsibility | Architecture doc |
|---|---|---|
| `@ft/genesis` | Congregation membership (first vertical): Postgres-backed members, RLS-enforced, on the shared kernel | 05, 08 |

Dependency direction is one-way toward `core`. `identity` builds on `core`; `api` is the composition
layer that wires `identity`, `authorization`, `tenancy`, and `audit` into one request pipeline. No
sideways product-to-product dependencies. This mirrors the ports/boundaries rule in doc 16 and keeps
each module independently extractable (doc 01).

## Commands

```bash
pnpm install        # install workspace dependencies
pnpm typecheck      # strict TypeScript type checking (no emit)
pnpm test           # run the full test suite (vitest)
pnpm test:coverage  # tests with coverage report
pnpm format         # prettier
```

## What the tests prove (the invariants, not just "it runs")

- **Tenant isolation** — a caller scoped to Tenant A cannot read, list, or mutate Tenant B's data;
  the attempt fails closed (`tenancy` tests). Proven again **at the database level** against real
  Postgres RLS in the Genesis integration test.
- **Deny-by-default authorization** — an action with no matching grant is denied; role inheritance and
  ABAC scope conditions resolve correctly (`authorization` tests).
- **Audit tamper-evidence** — any modification or deletion of a historical audit event breaks the hash
  chain and is detected by verification (`audit` tests).
- **The whole pipeline together** — the `@ft/api` kernel test and the Genesis vertical drive a request
  through authn → tenancy → authz → audit → handler and confirm 401/403/404 behavior, hard session
  revocation, step-up MFA, audit-on-success/denial, and idempotent replay.

## Running the database integration tests locally

The Genesis Postgres tests skip unless `FT_TEST_DATABASE_URL` points at a throwaway Postgres the test
may migrate:

```bash
FT_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/ft_test pnpm test
```

CI provides a Postgres service and sets this automatically, so the RLS invariant is proven on every run.

## Not yet built (next increments)

The transport adapter that mounts the kernel on a real HTTP server (NestJS/Fastify), the identity HTTP
endpoints (login / MFA / refresh) on top of `@ft/identity`, tenant provisioning and the user/membership
model (doc 05), and the Flutter client wiring come in later increments.
