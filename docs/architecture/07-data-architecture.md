# 07 — Data & Database Architecture, Backup & Disaster Recovery

Covers brief items **#10 (Database architecture)** and **#14 (Backup & disaster recovery)**.

---

## 1. Primary datastore: PostgreSQL

**PostgreSQL is the system of record** for all transactional, relational data across the platform.

**Why PostgreSQL:**
- **Relational integrity for relational data.** People, memberships, roles, permissions, medications,
  gifts, and ledgers are deeply relational with hard integrity constraints. A relational database
  with foreign keys, transactions, and constraints is the correct tool; giving that up for a document
  store would push integrity into application code where it rots.
- **Row-Level Security** is the structural backbone of tenant isolation (doc 04). This single feature
  is a major reason Postgres wins over most alternatives for a multi-tenant compliance platform.
- **Longevity and neutrality.** Postgres has a 25+ year track record, an open governance model (no
  single vendor can strand us), and will plausibly outlive most commercial databases — exactly what a
  decades-horizon company needs.
- **It is a Swiss-army knife that delays other datastores.** JSONB (semi-structured data), full-text
  search, `pgvector` (embeddings/AI features later), LISTEN/NOTIFY, and strong extension ecosystem
  mean we can go far before needing a separate search/vector/document store — fewer moving parts to
  secure and operate.
- **Managed availability** via AWS RDS/Aurora PostgreSQL gives Multi-AZ, automated backups, and PITR
  without us operating the database.

**Deployment:** **Amazon Aurora PostgreSQL** (or RDS PostgreSQL) Multi-AZ, with **read replicas** for
read-heavy products, **PgBouncer** connection pooling, and **RLS enforced** with a non-`BYPASSRLS`
application role. Aurora is preferred for its faster failover and storage-decoupled replicas; RDS
Postgres is the portable fallback (see §7 portability).

## 2. Polyglot persistence — deliberately minimal

We use additional datastores only where Postgres is genuinely the wrong tool, each with an explicit
justification:

| Store | Use | Why not Postgres |
|---|---|---|
| **Redis** | Cache, rate-limit counters, ephemeral sessions, queue backpressure | In-memory latency and TTL semantics Postgres should not be asked to provide |
| **Object storage (S3)** | Files, media, backups, WORM audit archive | Blobs do not belong in a relational DB (doc 10) |
| **Queue (SQS / equivalent)** | Async jobs, notifications, audit externalization | Durable at-least-once delivery, decoupling |
| **OpenSearch** *(Stage 2+)* | Full-text/faceted search at scale | Added only when Postgres FTS is outgrown (doc 01 §5) |

**Why keep the datastore count low:** every datastore is another thing to secure, back up, patch,
audit, and staff. "Boring, few, well-understood" beats a zoo of specialized stores (Principle 3).
We add a store when a measured need appears, not preemptively.

## 3. Data modeling standards

- **UUIDs (v7) as primary keys.** v7 is time-ordered, so it indexes well (avoids random-UUID index
  fragmentation) while remaining non-sequential/non-guessable — important so IDs in URLs don't leak
  counts or enable enumeration across tenants.
- **`tenant_id` on every tenant-owned table** (doc 04), leading column of the primary access index.
- **Schema migrations are versioned, forward-only, and reviewed** (doc 13/14). No manual production
  DDL, ever. Migrations are expand/contract (backward-compatible deploys): add columns before code
  uses them, remove after code stops, so deploys never require downtime.
- **Soft-delete + retention** for records that carry compliance meaning (never hard-delete a
  medication-administration or giving record); hard-delete only where privacy law requires and
  retention allows (doc 05/15).
- **Field-level data classification** (`none` / `PII` / `PHI` / `financial`) declared in the model, so
  encryption, audit, export, and masking behave correctly per field (doc 11/15).
- **Money is never floating point.** Stewardship uses integer minor units / `NUMERIC`, with currency,
  and an **append-only ledger** pattern (entries are added, never edited) mirroring the audit
  philosophy.
- **All timestamps UTC**, `timestamptz`, stored to the source of truth; display-tz is a
  presentation concern.

**Why these specifics matter for decades:** these are the modeling choices that are *catastrophic to
change later* (Principle 4). Getting keys, tenancy, time, money, and migration discipline right on day
one avoids the multi-year remediation projects that plague long-lived systems.

## 4. Data classification tiers (drives everything downstream)

| Tier | Examples | Handling |
|---|---|---|
| **Public** | Marketing content | No special controls |
| **Internal** | Aggregate metrics | Access-controlled |
| **Confidential / PII** | Names, emails, addresses, giving amounts | Encrypted at rest, access-logged |
| **Restricted / PHI** | CampMedMgr medications, health notes | Encrypted (incl. field-level), access-logged (reads too), strictest RBAC, silo-eligible |
| **Secret** | Credentials, keys, tokens | Secrets manager only, never in the app DB |

Classification is **assigned at the field/model level** and is the input to encryption (doc 11),
audit (doc 06), export/deletion (doc 05), and compliance scoping (doc 15). **Why centralize
classification:** one declaration drives many controls consistently, instead of each subsystem
re-deciding how sensitive a field is.

## 5. Backup & Disaster Recovery (#14)

### Objectives (per data class)

| Data class | **RPO** (max data loss) | **RTO** (max downtime) |
|---|---|---|
| Financial (Stewardship), PHI (CampMedMgr) | **≤ 5 min** | **≤ 1 hour** |
| General tenant data | ≤ 1 hour | ≤ 4 hours |
| Analytics/derived | ≤ 24 hours | Best effort |

**Why set RPO/RTO by data class:** losing a medication record or a gift is materially worse than
losing a cached metric. Uniform DR targets either over-spend on low-value data or under-protect
high-value data. Class-based targets spend protection where it matters.

### Mechanisms

- **Continuous backup + Point-in-Time Recovery** (Aurora/RDS) gives the ≤5 min RPO via transaction-
  log shipping — restore to any second within the retention window.
- **Automated daily snapshots**, retained per compliance retention, **encrypted with KMS**, and
  **replicated cross-region** for regional-disaster survival.
- **Object storage** (files, WORM audit) uses **cross-region replication** and versioning.
- **Backups are encrypted, access-controlled, and their restoration is audited.**
- **Immutable backups** (Object Lock) for the classes where ransomware/tamper is a concern — a backup
  an attacker can delete is not a backup.

### DR strategy & testing

- **Warm standby, multi-AZ, with cross-region restore capability** as the baseline. Aurora Global
  Database (cross-region read replica with fast promotion) is adopted for the ≤1h RTO tier.
- **Runbooks** for each failure class (AZ loss, region loss, data corruption, ransomware, accidental
  mass-delete) live in the repo and are executable, not narrative.
- **DR is tested on a schedule** (at least annually, ideally quarterly game-days): restore into an
  isolated environment, verify integrity, measure actual RPO/RTO against targets. **An untested
  backup is a hypothesis, not a recovery plan.**
- **Logical, not just physical, recovery:** we can also recover from *logical* corruption (a bad
  migration, a bulk mistake) via PITR to just-before, because physical replication faithfully
  replicates mistakes too.

**Why test DR regularly and loudly:** the single most common DR failure in the industry is
discovering at 3am that backups were incomplete, unrestorable, or slower than promised. Scheduled,
measured restores convert DR from faith into evidence — and produce SOC 2 evidence as a byproduct.

## 6. Data governance

- **Retention & deletion schedules** per data class and product, enforced by automation (doc 05/15).
- **Environments never share data**; production data is never copied to lower environments. Lower
  environments use **synthetic or irreversibly anonymized** data (doc 01 §2). **Why:** copying prod
  PHI/PII into dev is one of the most common breach and compliance failures; we forbid it structurally.
- **Analytics** run off replicas / a separate warehouse, never the transactional primary, and on
  de-identified data where possible.

## 7. Portability (managing cloud concentration risk)

We use **standard PostgreSQL and S3 APIs** and avoid deep proprietary features on the critical path,
so the system of record is **movable** to RDS-portable Postgres or another host if ever required. We
accept Aurora's proprietary storage engine because its *interface is standard Postgres* — the data and
queries move even if the engine does not. This keeps ADR-0003's exit path real without paying a
multi-cloud tax we don't need.

## 8. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Single primary is a bottleneck/SPOF** before tenant-sharding (doc 01 Stage 3). *Mitigation:*
  Multi-AZ, read replicas, PgBouncer, and the pre-built shard path.
- **RLS + heavy row volume** performance. *Mitigation:* `tenant_id`-leading indexes, partitioning of
  the largest tables (audit, med-admin logs) by time/tenant.
- **Backups are a copy of sensitive data** and thus a target. *Mitigation:* encrypted, access-
  controlled, Object-Locked, audited-on-restore.
- **Cross-region replication cost and lag.** *Mitigation:* class-based — only the high-value tiers get
  the expensive cross-region warm standby.
- **Vendor (Aurora) coupling.** *Mitigation:* portability discipline (§7).

**Tradeoffs accepted**
- Managed Aurora cost vs. self-hosted Postgres savings — managed wins for a small team's operational
  and compliance burden.
- Minimal polyglot persistence may push some workloads onto Postgres that a specialized store would
  serve better (e.g. search) — accepted until measured need; we add the store then, not before.

**Better alternatives if constraints differed**
- **Cockroach/Yugabyte (distributed SQL)** would give horizontal write-scale and multi-region
  natively, easing Stage 3 — rejected now for operational complexity, cost, and smaller talent pool
  relative to Postgres; revisit only if single-primary write throughput becomes the binding constraint.
- **Per-tenant databases from day one** (doc 04 silo) simplify sharding and blast radius at the cost of
  fleet management — used selectively for PHI/enterprise tenants, not as the default.

---

*Prev: [06 — Immutable Audit Logging](06-audit-logging.md) · Next: [08 — API Standards](08-api-standards.md)*
