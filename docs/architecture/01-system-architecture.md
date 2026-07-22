# 01 — Overall System Architecture & Scalability

Covers brief items **#1 (Overall system architecture)** and **#26 (Future scalability to millions
of users)**.

---

## 1. The shape of the system

Faith Trail Systems is a **multi-product, multi-tenant SaaS platform**. Every product is a thin
application on top of a shared **platform core** that provides identity, tenancy, authorization,
audit, storage, notifications, and observability.

```
                         ┌───────────────────────────────────────────┐
   Clients               │  Flutter apps (mobile / web / desktop)     │
   (Flutter)             │  CampMedMgr · Genesis · Kindling · Steward │
                         └───────────────┬───────────────────────────┘
                                         │ HTTPS / JSON (REST) + OIDC
                                         ▼
                         ┌───────────────────────────────────────────┐
   Edge                  │  CDN · WAF · API Gateway (TLS term, rate   │
                         │  limiting, authn verification, routing)    │
                         └───────────────┬───────────────────────────┘
                                         ▼
   Platform core         ┌───────────────────────────────────────────┐
   (shared, one          │  Identity · RBAC · Tenancy · Audit ·       │
   deployable, modular)  │  Users · Notifications · Files · Config    │
                         └───────────────┬───────────────────────────┘
                                         │ in-process module calls (now)
                                         │ network calls (after extraction)
                                         ▼
   Product modules       ┌──────────┬──────────┬──────────┬──────────┐
                         │CampMedMgr│ Genesis  │ Kindling │Stewardship│
                         └────┬─────┴────┬─────┴────┬─────┴────┬─────┘
                              ▼          ▼          ▼          ▼
   Data & infra         ┌───────────────────────────────────────────┐
                         │ PostgreSQL (RLS) · Object store (S3) ·     │
                         │ Cache/queue (Redis) · Search · Secrets ·   │
                         │ Managed email/SMS/push providers           │
                         └───────────────────────────────────────────┘
```

### Architecture style: **modular monolith first**

The platform core and the initial products ship as a **single deployable modular monolith** with
**hard module boundaries** enforced in code (see doc 16). Modules communicate through
**explicit interfaces**, never by reaching into each other's tables.

**Why a modular monolith and not microservices on day one:**

- **Operational cost.** A small company cannot afford to operate, secure, and audit dozens of
  independently deployed services from day one. Every service multiplies the surface for SOC 2
  evidence, network policy, secret rotation, and on-call.
- **Transactional simplicity.** Identity, tenancy, and audit are tightly coupled and benefit
  enormously from being able to commit in a single database transaction. Distributed transactions
  are the single largest source of accidental complexity in early-stage SaaS.
- **Refactoring speed.** Module boundaries in a monolith are cheap to move. Service boundaries are
  expensive to move (they become network APIs, versioned contracts, and deploy dependencies).
  Getting boundaries wrong early is normal; a monolith makes being wrong survivable.
- **The seams are still there.** Because modules only talk through interfaces, extraction to a
  separate service later is a mechanical change, not a rewrite. We design for extraction without
  paying for it prematurely (Principle 7).

**When we extract a service** (the gate, so this is not a matter of taste): a module is extracted
only when at least one is true and is *measured*, not anticipated:
- it has a materially different scaling profile (e.g. notification fan-out, file processing),
- it has a stricter compliance boundary that benefits from physical isolation (e.g. CampMedMgr PHI
  processing), or
- independent deploy cadence is blocking delivery (team contention on one pipeline).

The first three extraction candidates, in priority order, are: **(1) the audit sink**
(write-heavy, append-only, benefits from isolation), **(2) notification dispatch** (bursty,
provider-bound, retryable), and **(3) file/media processing** (CPU-heavy, isolatable).

## 2. Runtime topology & environments

Four environments, all provisioned by the **same Terraform** with different variables so that
"works in staging" is meaningful:

| Env | Purpose | Data |
|---|---|---|
| `dev` | Ephemeral per-developer / per-PR | Synthetic only |
| `staging` | Pre-prod, integration, pen-test target | Synthetic + anonymized |
| `prod` | Live | Real |
| `compliance-prod` (optional) | Physically siloed stack for HIPAA-heavy tenants | Real PHI |

**Why a separate `compliance-prod` option:** it lets us keep a strict HIPAA/PHI blast radius
(CampMedMgr) without forcing every non-PHI product into the cost and constraint of a HIPAA-scoped
environment. Data classification decides which environment a workload lands in (doc 15).

Compute runs on **managed Kubernetes (AWS EKS)** *or*, to start, a **managed container runtime
(AWS ECS Fargate/App Runner)**. We begin on the simpler managed runtime and adopt Kubernetes only
when horizontal complexity (many services, custom scheduling) justifies it — the container image
is the same, so this is a reversible operational decision, not an architectural one.

## 3. Technology selection & rationale

### Backend language: **TypeScript on Node LTS, framework NestJS**

**Why TypeScript/NestJS:**
- **Hiring and longevity.** JavaScript/TypeScript has the largest and most durable hiring pool of
  any server language. Over a decades horizon, being able to staff the team is a first-order
  concern, not a detail.
- **One type system across the stack (mostly).** API request/response schemas can be defined once
  and generated into clients; validation, DTOs, and OpenAPI come from the same source of truth.
- **NestJS gives us structure for free.** Dependency injection, module boundaries, guards
  (perfect for authz), and interceptors (perfect for audit) map directly onto our platform
  concerns. It nudges every product toward the same shape.
- **Ecosystem maturity** for exactly the boring things we need: Postgres drivers, OIDC libraries,
  queue clients, OpenTelemetry.

**Honest tradeoffs and the alternatives we rejected (this is the single most-scrutinized choice):**

| Alternative | Strength vs. TS | Why not chosen as the default |
|---|---|---|
| **Go** | Faster, lower memory, excellent concurrency, single static binary | Weaker for rich domain modeling; more boilerplate for CRUD-heavy products; smaller pool for *application* devs. **We reserve Go for extracted hot-path services** (audit sink, notification dispatch). |
| **Java / Kotlin + Spring** | Most mature enterprise/compliance ecosystem, superb tooling | Heavier operational footprint and slower iteration for a small team; excellent but "expensive" per feature. A very defensible alternative — if the team's center of gravity were JVM, this would be the pick. |
| **.NET / C#** | First-class enterprise story, great tooling, strong typing | Comparable to Java's tradeoffs; smaller talent pool in the faith-tech/nonprofit segment we hire from. |
| **Elixir/Phoenix** | Superb for real-time and fault tolerance | Small hiring pool; too much concentration risk for a decades-long staffing plan. |
| **Python** | Huge pool, great for data | Weaker static guarantees at scale; async story less clean for a request/response platform. |

**The meta-point:** the *WHY* is dominated by team-scalability and longevity, not raw performance.
Performance problems are solvable by extracting a Go service behind a stable interface; a hiring
crisis in year 8 is not. This decision is captured as **ADR-0002**.

### Client: **Flutter** — see docs 17 & 18. Rationale summary: already adopted in this repository,
one codebase across mobile/web/desktop, strong offline story (important for CampMedMgr at camps
with poor connectivity).

### Datastore: **PostgreSQL** — see doc 07. Rationale summary: relational integrity for
people/permissions/ledgers, **Row-Level Security** as a structural tenant-isolation control,
mature backup/PITR, and a 25+ year track record.

### Cloud: **AWS**
- **Widest compliance coverage** in one place: HIPAA BAA, SOC 2/3 reports, PCI DSS, ISO 27001,
  and a FedRAMP path if government-adjacent faith/education work ever appears.
- Managed primitives for every core need (RDS, S3, KMS, SQS, CloudFront, WAF, Secrets Manager).
- **Concentration-risk mitigation:** we avoid AWS-proprietary lock-in where the exit cost is high
  (see doc 07 §portability). We use OpenTelemetry, Terraform, and standard Postgres/S3 APIs so the
  platform is *movable*, even though we do not plan to move it. Captured as **ADR-0003**.

## 4. Request lifecycle (the one path every product shares)

1. Client obtains tokens from the **Identity** service via OIDC (doc 02).
2. Request hits **CDN → WAF → API Gateway**. Gateway terminates TLS, applies rate limits, and
   verifies the access token signature and expiry before anything reaches application code.
3. A platform **auth middleware** resolves the caller into a `SecurityContext`:
   `{ userId, tenantId, roles, permissions, sessionId }`.
4. A platform **tenancy middleware** sets the Postgres session variable `app.tenant_id`, which
   **RLS policies use to scope every query** (doc 04). This happens before any product code runs.
5. Product code executes against **already-scoped** data. It cannot accidentally read another
   tenant even if it forgets a `WHERE tenant_id = ?`.
6. An **audit interceptor** records security-relevant actions to the append-only audit store
   (doc 06) in the **same transaction** as the state change, so audit can never silently diverge
   from reality.
7. Response is serialized through a shared DTO layer that strips fields the caller's permissions
   do not allow (doc 03).

The value of this shared path: **isolation, authz, and audit are not the product developer's
responsibility to remember.** They are structural.

## 5. Scalability to millions of users (#26)

Scaling is planned as a sequence of **evidence-gated stages**, not a single leap. We do not build
for millions on day one; we ensure nothing in the design *prevents* reaching millions.

**Stage 0 — thousands (launch).** Single monolith, one primary Postgres (Multi-AZ), one read
replica, Redis cache, object storage. Vertical scaling headroom is enormous and cheap. This
carries FTS comfortably to five figures of users.

**Stage 1 — hundreds of thousands.** Horizontal scaling of stateless app instances behind the
gateway (they hold no session state — tokens are stateless, doc 02). Add read replicas for
read-heavy products (Genesis directories, Kindling feeds). Move notifications and audit to queues.

**Stage 2 — low millions.** Extract the three high-load modules (audit, notifications, file
processing) into independently scaled services behind their existing interfaces. Introduce a
**search datastore** (OpenSearch) for full-text so Postgres is not doing search. Cache hot
read-paths aggressively.

**Stage 3 — many millions.** **Tenant-aware horizontal data partitioning.** Because every row
already carries `tenant_id`, we can shard by tenant with minimal application change: large tenants
move to dedicated shards/silos (doc 04), and the pooled tier is partitioned by tenant-hash. This
is the payoff of enforcing `tenant_id` everywhere from day one.

**Why this staged approach is correct rather than timid:**
- **Multi-tenant SaaS scales along the tenant axis, not the user axis.** A million users spread
  across many organizations is a fundamentally *shardable* workload. The `tenant_id`-on-every-row
  invariant (doc 04) is what makes Stage 3 a configuration change instead of a rewrite. That single
  early decision is the whole scalability story.
- **Statelessness at the app tier** (Stage 0 already) means horizontal scale is "add instances,"
  not "re-architect."
- **Premature sharding is the classic fatal over-engineering** of early SaaS: it imposes cross-shard
  query pain and operational load for scale that may never arrive. We defer it behind a real
  measurement.

**The load profile we design against, per product** (informs *where* scale pressure lands):
- **CampMedMgr:** bursty, seasonal (camp season), write-heavy medication-administration logs,
  offline-tolerant. Scale pressure = write throughput + audit volume.
- **Genesis:** steady, read-heavy directory/membership. Scale pressure = read fan-out + search.
- **Kindling:** engagement feeds, notification fan-out. Scale pressure = notifications + caching.
- **Stewardship:** periodic spikes (year-end giving), strong consistency for ledgers. Scale
  pressure = transactional integrity, not raw QPS.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks of the chosen design**
- **Monolith blast radius.** A bad deploy can affect all products at once. *Mitigation:* strong
  CI gates (doc 13), progressive delivery (canary), and the compliance-prod silo for the highest-
  stakes workload (CampMedMgr).
- **Shared-database contention** at higher scale before Stage 3. *Mitigation:* read replicas,
  connection pooling (PgBouncer), and the pre-designed tenant-shard path.
- **Single-language concentration.** If TypeScript/Node's trajectory sours over a decade, we are
  exposed. *Mitigation:* interfaces + OpenAPI mean products are language-portable at the seams;
  Go is already an accepted second language for services.
- **Cloud concentration (AWS).** Provider risk. *Mitigation:* portability discipline (ADR-0003),
  though a true multi-cloud posture is deliberately **not** pursued (its cost is not justified).

**Tradeoffs we are consciously accepting**
- Simplicity now in exchange for a future extraction project (accepted; the extraction is cheap by
  design).
- Managed AWS services (higher unit cost, lower ops burden) over self-hosting (lower unit cost,
  much higher ops + compliance burden). For a small team, managed wins decisively.

**Better alternatives if constraints were different**
- If FTS were VC-funded with a large platform team from day one, a **service-oriented architecture
  with a dedicated identity service** would be defensible immediately. We reject it *only* because
  of team size and operational cost, and we keep the door open.
- If the portfolio were **single-tenant enterprise installs** (on-prem per church), a very
  different, deploy-per-customer architecture would win. Our assumption is **cloud multi-tenant
  SaaS**; if that assumption is wrong, most of this document changes and should be revisited first.

---

*Prev: [README](README.md) · Next: [02 — Authentication & MFA](02-authentication-mfa.md)*
