# Architecture Decision Records (ADRs)

An **ADR** captures a single significant decision: its context, the decision, the rationale, the
alternatives considered, and the consequences. We keep them because, over a decades-long lifetime, the
most valuable thing a future maintainer can have is **the original reasoning** behind a hard-to-reverse
choice — so they can tell whether the context still holds before overturning it.

## Conventions

- One decision per file: `ADR-NNNN-short-title.md`.
- **Status:** Proposed → Accepted → (later) Deprecated / Superseded-by-NNNN. ADRs are **immutable
  once accepted**; we don't rewrite history, we supersede it with a new ADR (the same philosophy as
  the audit log, doc 06).
- Each ADR states an explicit **reversibility** rating (Easy / Moderate / Hard), because how hard a
  decision is to undo determines how much scrutiny it deserves (Principle 4).

## Index (decisions referenced across the architecture)

| ADR | Decision | Reversibility | Referenced by |
|---|---|---|---|
| 0001 | Modular monolith first; extract services on measured need | Moderate | doc 01 |
| 0002 | Backend language: TypeScript/NestJS (Go for hot-path services) | Hard | doc 01 |
| 0003 | Primary cloud: AWS, with portability discipline | Hard | doc 01, 07, 11, 12 |
| 0004 | Central platform-owned IdP behind a facade; managed engine first | Moderate | doc 02 |
| 0005 | RBAC+ABAC now; keep a Zanzibar-style ReBAC swap-in path | Moderate | doc 03 |
| 0006 | Tiered multi-tenancy (pooled + RLS default, silo for regulated) | Hard | doc 04 |
| 0007 | Self-managed immutable audit (Postgres + WORM + hash chain) | Moderate | doc 06 |
| 0008 | Monorepo for platform + products | Moderate | doc 16 |

> The bodies below are condensed but complete. As the platform is built, each becomes its own file and
> gains real-world consequences as they are observed.

---

## ADR-0001 — Modular monolith first

**Status:** Accepted · **Reversibility:** Moderate (module → service extraction is designed to be cheap)

**Context.** Small team, multiple products, regulated data, decades horizon. Microservices impose heavy
operational/compliance overhead per service; a big-ball-of-mud monolith is unmaintainable.

**Decision.** Ship a **modular monolith** with hard, CI-enforced module boundaries and ports-only
cross-module contracts (doc 16). Extract a module into a service only on a *measured* trigger
(different scaling profile, stricter compliance boundary, or deploy-cadence contention) — first
candidates: audit, notifications, file processing.

**Why.** Maximizes early velocity and transactional simplicity (identity/tenancy/audit commit
together), minimizes ops/compliance surface, and keeps boundaries cheap to move while we're still
learning where they belong. The ports keep future extraction mechanical, not a rewrite.

**Alternatives.** Microservices from day one (rejected: operational/compliance cost for a small team);
unstructured monolith (rejected: unmaintainable at scale).

**Consequences.** Shared deploy/blast-radius (mitigated by CI gates, progressive delivery, PHI silo);
requires discipline to keep boundaries clean (enforced in CI).

---

## ADR-0002 — Backend language: TypeScript/NestJS

**Status:** Accepted · **Reversibility:** Hard (rewriting services is expensive)

**Context.** Need a primary backend language for a decades-long, changing team building CRUD-heavy,
compliance-heavy products.

**Decision.** **TypeScript on Node LTS with NestJS** as the primary backend language/framework;
**Go** reserved for extracted hot-path services (audit sink, notification dispatch).

**Why.** Largest, most durable hiring pool (staffing over decades is a first-order risk); shared schema/
type tooling with the API contract and generated clients; NestJS DI/guards/interceptors map directly
onto our auth/audit/tenancy needs; mature ecosystem for the boring essentials.

**Alternatives.** Go (reserved for services, not primary: weaker domain modeling/CRUD ergonomics);
Java/Kotlin+Spring (strong, defensible; rejected for heavier footprint at small scale — the closest
runner-up); .NET (similar tradeoffs, smaller pool in our segment); Elixir/Python (pool/typing concerns).

**Consequences.** Node's single-thread/CPU-bound weaknesses are handled by extracting Go services behind
stable ports; performance is a solvable, localized problem, unlike a hiring crisis.

---

## ADR-0003 — Primary cloud: AWS with portability discipline

**Status:** Accepted · **Reversibility:** Hard

**Context.** Regulated portfolio (HIPAA/PCI/SOC 2) needs broad compliance coverage and managed
primitives; a small team can't run raw infrastructure.

**Decision.** **AWS** as the single primary cloud. Avoid deep proprietary lock-in on the critical path:
standard PostgreSQL and S3 APIs, Terraform, OpenTelemetry, OCI containers — so the platform is
*movable* even though we don't plan to move it. No active multi-cloud.

**Why.** Widest compliance coverage in one place (BAA, SOC 2/3, PCI, ISO, FedRAMP path); managed
services for every core need; a movable-by-standards posture caps concentration risk without paying a
multi-cloud tax.

**Alternatives.** Multi-cloud (rejected: cost/complexity unjustified); GCP/Azure (comparable; AWS chosen
for breadth/maturity); self-hosted (rejected: ops/compliance burden).

**Consequences.** Provider concentration risk, mitigated by portability discipline and standard
interfaces; some higher unit cost accepted for lower operational and compliance burden.

---

## ADR-0004 — Central IdP behind a facade; managed engine first

**Status:** Accepted · **Reversibility:** Moderate (facade isolates the provider)

**Context.** Identity is the highest-consequence component; hand-rolling it is dangerous; per-product
auth would fragment the security floor.

**Decision.** One **platform-owned identity facade** speaking OIDC/OAuth2; back it initially with a
**managed engine** (Cognito/Auth0) for speed-to-compliance; keep **Keycloak/Ory** as the self-hosted
path. Products only ever call the facade.

**Why.** One security floor, SSO, one auth audit trail; buy the hardest-to-get-right component; the
facade makes the provider a reversible choice and prevents lock-in/pricing traps at scale.

**Alternatives.** Per-product auth (rejected: fragmented posture); self-built IdP (rejected: too risky);
managed with no facade (rejected: lock-in).

**Consequences.** Facade is extra code and a critical dependency (mitigated by Multi-AZ, cached JWKS,
strict review).

---

## ADR-0005 — RBAC+ABAC now, ReBAC swap-in path preserved

**Status:** Accepted · **Reversibility:** Moderate

**Context.** Ministries think in roles; real scoping ("this nurse, this camp") needs attributes; deep
relationship-sharing may emerge later.

**Decision.** **RBAC as the backbone + ABAC conditions** for scoping; expose all decisions through
`AuthorizationService.can()` so a **Zanzibar-style ReBAC** engine (SpiceDB/OpenFGA) can replace the
backend later without changing product code.

**Why.** RBAC is legible to admins/auditors and produces clean access-review evidence; ABAC avoids role
explosion; the central decision API keeps the model swappable if relationship-graph needs appear.

**Alternatives.** Pure RBAC (role explosion); pure policy-as-code/OPA (auditor legibility); ReBAC now
(premature without the need).

**Consequences.** RBAC+ABAC has more moving parts than flat RBAC (accepted for correctness); the `can()`
seam must be respected everywhere.

---

## ADR-0006 — Tiered multi-tenancy

**Status:** Accepted · **Reversibility:** Hard (tenancy model is foundational)

**Context.** Thousands of small tenants plus PHI-heavy and premium tenants needing strong isolation.

**Decision.** **Tiered tenancy**: pooled + `tenant_id` + RLS by default; schema-per-tenant (bridge) and
dedicated-DB/stack (silo) for regulated/premium tenants; tenants promotable between tiers without app
changes. `tenant_id` on every row is mandatory and CI-enforced.

**Why.** Matches isolation to risk and economics; RLS makes the worst bug class (missing tenant filter)
non-exploitable; `tenant_id`-everywhere is also the enabler of Stage-3 tenant sharding (doc 01 §5).

**Alternatives.** Always-pooled (blast radius unacceptable for PHI/enterprise); always-siloed (doesn't
scale to many small tenants operationally).

**Consequences.** RLS overhead and the discipline of universal `tenant_id`; cross-tenant admin/analytics
paths are high-risk and specially handled.

---

## ADR-0007 — Self-managed immutable audit

**Status:** Accepted · **Reversibility:** Moderate (interface is generic)

**Context.** SOC 2/HIPAA require a tamper-evident record, including PHI/financial *reads*; audit data is
sensitive and tenant-scoped.

**Decision.** **Append-only Postgres store + hash chaining + externalized WORM (S3 Object Lock)**, behind
a generic audit interface; keep the option to adopt a managed ledger later.

**Why.** In-DB append-only gives fast tenant-scoped query for features/reviews; hash chain + WORM gives
"even our DBAs can't tamper" provability; keeping audit under our own tenancy/KMS avoids piping sensitive
data to a third party prematurely. The generic interface preserves the swap option.

**Alternatives.** Managed ledger/audit SaaS from day one (lock-in, data-residency of sensitive events);
plain log table (not tamper-evident).

**Consequences.** Write amplification and volume (mitigated by extraction-first candidate, partitioning,
redaction, tiered storage).

---

## ADR-0008 — Monorepo for platform + products

**Status:** Accepted · **Reversibility:** Moderate (clean ports/SDKs keep a future split cheap)

**Context.** Many products share a security-critical core that must stay in lockstep.

**Decision.** A **monorepo** with CI-enforced module boundaries, CODEOWNERS, and build/test-impact
analysis; generated SDKs and ports keep a future polyrepo split possible.

**Why.** Atomic cross-cutting changes to the shared security core + its consumers in one reviewed
commit; one source of truth for standards/tooling; discoverability drives reuse. Polyrepo would scatter
the platform's guarantees across version boundaries.

**Alternatives.** Polyrepo + versioned platform SDK (right once products are truly independent; premature
now — coordination cost without the payoff).

**Consequences.** Monorepo CI/tooling investment and coupling temptation (mitigated by CI-enforced
boundaries and impact analysis).

---

*Back to [architecture index](../README.md)*
