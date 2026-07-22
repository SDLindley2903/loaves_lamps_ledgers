# Faith Trail Systems — Enterprise Platform Architecture

**Status:** Draft for approval · **Version:** 0.1 · **Owner:** Office of the Chief Architect
**Audience:** Engineering, Security, Compliance, Product, and future maintainers of Faith Trail Systems (FTS).

This directory is the **canonical architecture** for the shared platform that every FTS
product builds on. It is a design specification, not implementation. No production code is to
be written against it until this set of documents is reviewed and approved.

---

## 1. Why this document exists

FTS is not building one product. It is building a **portfolio** of regulated SaaS products that
must share identity, tenancy, audit, security, and operational infrastructure. If each product
reinvents authentication, tenant isolation, and audit logging, FTS will accumulate divergent
security postures, duplicate compliance work, and a maintenance burden that compounds every year.

The platform exists so that **every product inherits the same security floor, the same
compliance evidence, and the same operational discipline** by default, and so that a new product
can reach "production-ready and auditable" in weeks rather than quarters.

The company is planned to operate for **decades**. That single constraint drives most of the
decisions here: we bias toward **boring, durable, well-documented technology** over novelty, we
write down the *why* so future maintainers can revisit decisions with the original context, and
we treat reversibility as a first-class property.

## 2. The product portfolio (and why the platform must be general)

| Product | Domain (assumed) | Dominant compliance driver |
|---|---|---|
| **CampMedMgr** | Camp / retreat medication & health administration for minors | **HIPAA** (PHI), state minor-consent law |
| **Genesis** | Congregation / membership & people management | PII, **SOC 2**, possibly FERPA if education attached |
| **Kindling** | Discipleship / small-group / childrens ministry engagement | PII of minors, **COPPA**, SOC 2 |
| **Stewardship** | Giving, pledges, funds accounting | Financial data, **PCI DSS** (via tokenization), SOC 2 |
| **Future products** | Unknown | Must be assumable without re-architecting |

Because the portfolio already spans **PHI, minors' data, and financial data**, the platform is
designed to the **strictest common denominator** (HIPAA + SOC 2) and then relaxes per product
where a control does not apply. It is far cheaper to start strict and relax than to retrofit
strict controls onto a permissive base.

> **Note on domain assumptions.** Product domains above are inferred from product names and the
> parent repository. Each assumption is called out so reviewers can correct it. Where a compliance
> obligation hinges on a domain assumption, the relevant document flags it explicitly.

## 3. Guiding architectural principles

Every decision in this repository is expected to trace back to one of these. When two principles
conflict, they are ordered: an earlier principle wins over a later one.

1. **Secure and compliant by default.** The default configuration of any component is the
   compliant one. Making something less secure requires a deliberate, logged, reviewed action.
2. **Tenant isolation is sacred.** No code path may return one organization's data to another.
   This is the one invariant we design to enforce structurally, not by convention.
3. **Boring, durable technology.** Prefer widely-adopted, well-documented, slow-moving
   technology with a large hiring pool and a long support horizon over anything novel.
4. **Reversible before irreversible.** Prefer decisions that can be undone. When a decision is
   hard to reverse (data model, tenancy model, primary datastore), invest proportionally more
   review before committing.
5. **Everything auditable.** Every security-relevant action produces immutable audit evidence.
   Compliance is a byproduct of good engineering, not a separate project.
6. **One way to do common things.** Auth, RBAC, tenancy, audit, notifications, storage, and
   observability are solved **once**, in shared libraries, and consumed identically everywhere.
7. **Simple first, scalable when proven.** Start as a modular monolith. Extract services only
   when a real, measured constraint demands it. Design the seams now; cut them later.
8. **Write down the why.** Decisions are captured as ADRs (`adr/`). Code without a documented
   rationale is a liability to the maintainer five years from now.

## 4. How to read this repository

Documents are numbered in a recommended reading order. Each one states the decision, the
**rationale (WHY)**, and an explicit **Weaknesses / Risks / Tradeoffs / Better Alternatives**
section, because a design that hides its own downsides cannot be safely maintained for decades.

| # | Document | Covers the brief's items |
|---|---|---|
| 01 | [System Architecture](01-system-architecture.md) | Overall architecture (1), Scalability to millions (26) |
| 02 | [Authentication & MFA](02-authentication-mfa.md) | Authentication (2), MFA (3) |
| 03 | [Authorization & RBAC](03-authorization-rbac.md) | RBAC (4) |
| 04 | [Tenant Isolation](04-tenant-isolation.md) | Organization/tenant isolation (5) |
| 05 | [User Management](05-user-management.md) | User management (7) |
| 06 | [Immutable Audit Logging](06-audit-logging.md) | Audit logging (6) |
| 07 | [Data & Database Architecture](07-data-architecture.md) | Database (10), Backup/DR (14) |
| 08 | [API Standards](08-api-standards.md) | API standards (11) |
| 09 | [Notification Framework](09-notifications.md) | Notifications (8) |
| 10 | [File Storage Architecture](10-file-storage.md) | File storage (9) |
| 11 | [Security & Encryption](11-security-encryption.md) | Security (12), Encryption (13) |
| 12 | [Observability & Error Handling](12-observability.md) | Logging/monitoring (15), Error handling (16) |
| 13 | [CI/CD Pipeline](13-cicd-pipeline.md) | CI/CD (17) |
| 14 | [Engineering Standards](14-engineering-standards.md) | Dev (18), Coding (19), Testing (20) |
| 15 | [Compliance Readiness](15-compliance.md) | SOC 2 / FERPA / HIPAA / PCI / COPPA (21) |
| 16 | [Repository & Folder Structure](16-repository-structure.md) | Folder (22), Repo (23) |
| 17 | [Shared Component Library](17-shared-component-library.md) | Shared components (24) |
| 18 | [UI Design Standards](18-ui-design-standards.md) | UI design (25) |
| — | [Decision Records](adr/README.md) | Cross-cutting rationale + reversibility log |

## 5. Platform technology summary (decisions detailed in linked docs)

| Concern | Decision | One-line why (full rationale in linked doc) |
|---|---|---|
| Client | **Flutter (Dart)** | Already in use; one codebase for mobile/web/desktop; see doc 17/18 |
| Backend language | **TypeScript (Node LTS) + NestJS** | Large hiring pool, structured DI framework, shared schema tooling; alternatives (Go, Java, .NET) weighed in doc 01 |
| Architecture | **Modular monolith → selective service extraction** | Simplicity now, seams for later; doc 01 |
| Primary datastore | **PostgreSQL** | Durable, relational, RLS for tenant isolation, decades of runway; doc 07 |
| Multi-tenancy | **Pooled + RLS, with silo option for regulated tenants** | Cost-efficient default, hard isolation where required; doc 04 |
| Cloud | **AWS** | Broadest compliance coverage (HIPAA BAA, SOC 2/3, PCI, FedRAMP path); doc 01/11 |
| Identity | **Central Identity Provider (OIDC/OAuth2), platform-owned** | One login, one MFA policy, one audit trail; doc 02 |
| Audit | **Append-only, hash-chained audit store** | Tamper-evidence for SOC 2 / HIPAA; doc 06 |
| IaC | **Terraform** | Declarative, reviewable, reproducible environments; doc 13 |
| Observability | **OpenTelemetry** | Vendor-neutral instrumentation, avoids lock-in; doc 12 |

## 6. What this architecture deliberately does *not* do yet

- It does not pick specific SaaS vendors for email/SMS/error-tracking beyond naming defaults and
  the interface they must satisfy. Vendor choice is reversible and deferred.
- It does not design product-specific data models. It designs the **shared substrate** only.
- It does not commit to microservices. That is an explicitly deferred, evidence-gated decision.

## 7. Top platform-level risks (summary; detailed per document)

1. **Tenant-isolation failure** is the highest-severity risk in the portfolio. Mitigation is
   defense-in-depth (doc 04): RLS + application scoping + test enforcement + audit.
2. **Compliance scope creep** — one product dragging HIPAA obligations onto shared infrastructure
   used by non-HIPAA products. Managed by data-classification boundaries (doc 15).
3. **Single-language / single-cloud concentration** — reduces complexity but concentrates risk.
   Accepted deliberately; exit paths documented (doc 01, doc 07).
4. **Key-person and knowledge risk over a decades horizon** — mitigated by ADRs, runbooks, and
   "one way to do things" rather than tribal knowledge.

---

*Next: [01 — System Architecture](01-system-architecture.md)*
