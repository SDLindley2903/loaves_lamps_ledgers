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
| `@ft/users` | User accounts, memberships, credential + MFA lifecycle (register, verify, enroll) | 02, 05 |
| `@ft/server` | HTTP transport adapter + auth endpoints (register/login/MFA/refresh/logout); security headers; composition root | 01, 02, 08, 11 |

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

## Running the server

In-memory mode (no database), using the real auth flow (register → login):

```bash
pnpm serve                 # listens on :8080
curl -s localhost:8080/health
curl -s -X POST localhost:8080/auth/register -H 'content-type: application/json' \
  -d '{"email":"pastor@firstchurch.org","password":"a decent passphrase","organizationName":"First Church"}'
TOKEN=$(curl -s -X POST localhost:8080/auth/login -H 'content-type: application/json' \
  -d '{"email":"pastor@firstchurch.org","password":"a decent passphrase"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
curl -s -X POST localhost:8080/genesis/members -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Ada","email":"ada@example.org"}'
curl -s localhost:8080/genesis/members -H "authorization: Bearer $TOKEN"
```

Auth endpoints: `POST /auth/register`, `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`,
`/auth/logout`, `/auth/mfa/enroll`, `/auth/mfa/enroll/confirm`. A login for an MFA-enrolled account
returns `{ mfaRequired: true, challengeId }`; complete it at `/auth/mfa/verify` with a TOTP or recovery
code. (`pnpm serve:dev` additionally enables the legacy `/dev/login` shortcut; not needed now that real
auth exists.)

Postgres mode (RLS-enforced). `DATABASE_URL` must connect as a **non-bypass** role (`ft_app`); the
admin URL runs migrations and provisions tenants:

```bash
DATABASE_URL=postgres://ft_app:ft_app_local_dev@127.0.0.1:5432/ft_test \
FT_ADMIN_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/ft_test \
FT_DEV_AUTH=1 FT_MIGRATE=1 pnpm serve
```

> The DEV token endpoint (`/dev/login`) exists only for local testing and is registered solely when
> `FT_DEV_AUTH=1`. It is replaced by the real login/MFA flow in the next increment and must never be
> enabled in production.

## Running the database integration tests locally

The Genesis Postgres tests skip unless `FT_TEST_DATABASE_URL` points at a throwaway Postgres the test
may migrate:

```bash
FT_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/ft_test pnpm test
```

CI provides a Postgres service and sets this automatically, so the RLS invariant is proven on every run.

## Not yet built (next increments)

Postgres-backed user, membership, and session stores (users/sessions are currently in-memory, so they
reset on restart; product data already persists in Postgres), the invitation flow for adding users to
an existing organization (registration currently creates a new org), and the Flutter client wiring come
in later increments.
