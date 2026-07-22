# 04 — Organization (Tenant) Isolation

Covers brief item **#5 (Organization/tenant isolation)**.

This is the platform's **most important invariant**. A failure here is the worst outcome in the
portfolio: one organization seeing another's PHI, giving records, or members. Every decision in
this document optimizes for making cross-tenant leakage **structurally impossible**, not merely
unlikely.

---

## 1. The tenancy model: pooled-by-default, siloed-when-required

FTS uses a **tiered multi-tenancy model**:

| Tier | Isolation | Who gets it | Why |
|---|---|---|---|
| **Pooled** | Shared DB, shared schema, **RLS + `tenant_id` on every row** | Default: most tenants | Cheapest, easiest to operate and patch, scales to many tenants |
| **Bridge (schema-per-tenant)** | Shared DB, separate Postgres schema per tenant | Large tenants, stricter contractual isolation | Stronger blast-radius separation without a full DB per tenant |
| **Siloed** | Dedicated database (and, for `compliance-prod`, dedicated stack) | HIPAA-heavy (CampMedMgr), enterprise contracts requiring it | Hard physical isolation; independent encryption keys & backups |

A tenant can be **promoted** between tiers without application changes, because the application
always addresses data through the same `tenant_id`-scoped interface regardless of tier.

**Why tiered rather than "always pooled" or "always siloed":**
- **Always siloed** (a DB per church) is the safest but does not scale operationally to thousands
  of small tenants and makes cross-tenant platform features (billing, support) painful and costly.
- **Always pooled** is efficient but concentrates every tenant's data in one blast radius, which is
  hard to justify for PHI and for large contractual customers who demand isolation.
- **Tiered** lets the economics match the risk: small low-sensitivity tenants share; PHI and
  premium tenants get isolation. This is the mainstream mature-SaaS answer. Captured as **ADR-0006**.

## 2. How pooled isolation is enforced (defense in depth)

Pooled isolation does **not** rely on developers remembering to filter by tenant. It is enforced in
layers, each of which alone would catch most mistakes:

1. **`tenant_id` on every tenant-owned row**, non-null, foreign-keyed to the tenants table. No
   exceptions; a migration that adds a tenant-owned table without `tenant_id` fails CI (doc 13).
2. **PostgreSQL Row-Level Security (RLS)** policies on every tenant-owned table:
   `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. The database itself refuses to
   return rows outside the current tenant, for **every** query, forever.
3. **Tenancy middleware** sets `app.tenant_id` from the verified token at the start of each request,
   inside the transaction, *before any product code runs* (doc 01 §4). Product code physically
   cannot widen the scope.
4. **Application repository layer** additionally scopes queries, so intent is explicit and reviewable.
5. **A distinct low-privilege DB role** for application connections that **cannot bypass RLS**
   (only migration/ops roles can), so an application-layer SQL bug cannot escape isolation.

**Why RLS is the linchpin:**
- It moves the isolation guarantee **below** the application, into the database, where a forgotten
  `WHERE` clause cannot defeat it. Application code is where bugs live; RLS makes the most dangerous
  bug class (missing tenant filter) **non-exploitable**.
- It is a single, auditable, testable control that covers thousands of queries uniformly. Auditors
  can inspect the policies rather than trusting every query.

**Why we still scope in the app layer too (belt and suspenders):** RLS depends on `app.tenant_id`
being set correctly. The middleware sets it; the app-layer scoping and tests ensure the middleware
is never bypassed (e.g. background jobs, batch imports). Two independent mechanisms must both fail
to leak.

## 3. Isolation beyond the database

Tenant isolation is not only a data-row concern:

- **Object storage (files):** every object key is **prefixed with `tenant_id`**, and per-tenant IAM/
  bucket-policy scoping prevents cross-tenant object access even at the storage layer (doc 10).
- **Caching:** cache keys are **namespaced by `tenant_id`**; a cache lookup can never return another
  tenant's cached value. Cross-tenant cache poisoning is structurally prevented.
- **Search:** per-tenant index or a mandatory tenant filter injected by the platform, never by the
  product query.
- **Background jobs / queues:** every job payload carries `tenant_id`; the worker re-establishes the
  same scoped `SecurityContext` and `app.tenant_id` as a web request, so async work is isolated
  identically to sync work. This is a common leak point in SaaS and is closed by design.
- **Encryption keys:** siloed and (optionally) bridge tenants get **per-tenant data keys** under a
  central KMS (doc 11), enabling per-tenant crypto-shredding on offboarding.
- **Rate limiting & quotas:** per-tenant, so one tenant cannot exhaust shared capacity (a noisy-
  neighbor and a mini-DoS protection).

## 4. Tenant lifecycle

- **Provisioning:** creating a tenant is a single platform operation that sets up the tenant row,
  default roles (doc 03), the initial admin, storage prefix, and (for siloed) the dedicated
  resources — all in one auditable transaction/workflow.
- **Data residency:** the model supports pinning a tenant's data to a region (needed for
  international ministries / data-sovereignty). Region is a tenant attribute honored by storage and
  DB placement.
- **Offboarding / deletion:** a tenant can be fully exported (their data, portable format) and then
  **cryptographically shredded** (destroy their keys for siloed/bridge) or hard-deleted (pooled),
  with a documented retention/tombstone period for legal holds. This is both a GDPR/CCPA "right to
  deletion" capability and a trust feature.

**Why design deletion carefully now:** deletion and export are painful to retrofit and are
regulatory obligations (GDPR, FERPA education-record rights, HIPAA). Building them into the tenant
lifecycle from the start avoids an expensive later scramble.

## 5. Testing the invariant (isolation is verified, not assumed)

- **Automated cross-tenant tests** in CI: for representative endpoints, a request authenticated as
  Tenant A attempting to read/modify Tenant B's resources **must** get a not-found/forbidden. These
  tests are mandatory and block merge (doc 13/14).
- **RLS policy tests:** every tenant-owned table has a test asserting RLS denies cross-tenant reads
  even with a raw query.
- **Fuzz/negative tests** on `tenant_id` handling (missing, malformed, mismatched between token and
  body).

**Why make this a hard CI gate:** the invariant is only real if it is continuously proven. A test
suite that fails the build on any cross-tenant leak turns the platform's most important promise into
something that cannot silently regress.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Misconfigured `app.tenant_id`** (e.g. a job that forgets to set it) would fail *closed* under
  RLS (return nothing) rather than leak — but that is a correctness bug. *Mitigation:* a shared
  job/runtime wrapper that always sets scope; tests that assert scope is set.
- **RLS bypass via a privileged role.** If application code ever connects as a superuser/`BYPASSRLS`
  role, isolation is gone. *Mitigation:* app role provably lacks `BYPASSRLS`; CI/infra checks assert
  this; migrations use a separate role.
- **Pooled blast radius** — a DB-level compromise exposes many tenants. *Mitigation:* encryption at
  rest, least-privilege DB roles, siloing the highest-value data (CampMedMgr PHI), and monitoring.
- **Performance of RLS** at scale (policy evaluation per row). *Mitigation:* `tenant_id` is the
  leading column of key indexes; measured and acceptable; large tenants graduate to bridge/silo.
- **Cross-tenant features** (platform admin, aggregate analytics) must deliberately step outside the
  scope and are therefore high-risk surfaces. *Mitigation:* those few paths are explicit, privileged,
  heavily audited, and separately reviewed.

**Tradeoffs accepted**
- Pooled efficiency vs. siloed safety — resolved by tiering rather than a single global choice.
- The overhead of `tenant_id` everywhere and RLS on every table — accepted as the price of a
  structural guarantee; it is exactly the overhead that later enables tenant-sharding (doc 01 §5).

**Better alternatives if constraints differed**
- **Silo-per-tenant from day one** (a database or even a stack per tenant) would give the strongest
  isolation and simplest mental model, and is the right call for a small number of high-value
  enterprise/PHI customers. We reject it as the *default* purely on operational scalability for many
  small tenants, and we *do* use it for the tenants that warrant it.
- **Cell-based architecture** (partitioning tenants into isolated "cells," each a full stack serving
  a subset of tenants) is the likely end-state at very large scale — it caps blast radius while
  keeping pooled economics. It is compatible with everything here (a cell is "a pool of tenants") and
  is the natural Stage-3 evolution (doc 01). Deferred until scale warrants; noted as a future ADR.

---

*Prev: [03 — Authorization & RBAC](03-authorization-rbac.md) · Next: [05 — User Management](05-user-management.md)*
