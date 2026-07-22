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
  the attempt fails closed (`tenancy` tests).
- **Deny-by-default authorization** — an action with no matching grant is denied; role inheritance and
  ABAC scope conditions resolve correctly (`authorization` tests).
- **Audit tamper-evidence** — any modification or deletion of a historical audit event breaks the hash
  chain and is detected by verification (`audit` tests).

## Not yet built (next increments)

The data-layer RLS control is included as a migration (`packages/tenancy/sql/rls.sql`); a Postgres
integration test that runs it against a real database, the transport adapter that mounts the kernel on
NestJS/Fastify, the identity HTTP endpoints (login/MFA/refresh) on top of `@ft/identity`, and the first
product module (a Genesis membership vertical) come in later increments.
