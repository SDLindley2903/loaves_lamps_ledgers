# 14 — Engineering Standards: Development, Coding & Testing

Covers brief items **#18 (Development standards)**, **#19 (Coding standards)**, and
**#20 (Testing standards)**.

These standards exist so that a **decades-long, changing team** produces code that reads as if one
careful person wrote it, and so that quality and security are habits enforced by tools, not left to
individual diligence.

---

## 1. Development standards (#18)

**Workflow**
- **Trunk-based development** with short-lived branches, small PRs, and frequent integration
  (doc 13). **Why:** small changes are easier to review well, safer to ship, and faster to revert.
- **Every change is a reviewed pull request.** No direct pushes to main. At least one reviewer;
  **security-sensitive areas (auth, RBAC, tenancy, crypto, audit) require a security-designated
  reviewer** via CODEOWNERS. **Why:** these areas are where mistakes are catastrophic and least
  self-evident.
- **Definition of Done** is explicit: code + tests + docs + observability (metrics/logs) + security
  considered + backward-compatible migration + passing pipeline. A feature isn't done when it works;
  it's done when it's operable and safe.
- **Design docs / RFCs for significant changes**, and **ADRs** (`adr/`) for decisions with long-term
  consequences. **Why:** the *why* must outlive the author (Principle 8).
- **Threat modeling** is a required step for features touching sensitive data or auth — lightweight,
  but done before code.

**Collaboration & knowledge**
- **Documentation lives with the code** and is updated in the same PR — stale docs are treated as bugs.
- **Runbooks** for every operational surface (doc 12/13), executable and current.
- **Blameless post-incident reviews** feed learnings back into standards and automation.
- **Onboarding target:** a new engineer ships a small change safely in their first days, because the
  golden path is paved and documented. **Why:** over decades, onboarding efficiency compounds more than
  almost anything else.

**Code review standards** — reviewers check: correctness, security (authz declared? tenant-scoped?
input validated? secrets absent?), tests present and meaningful, observability, backward compatibility,
and readability. Reviews are timely (a tracked norm) and kind; we review the code, not the person.

## 2. Coding standards (#19)

**Universal principles (language-agnostic)**
- **Consistency over personal preference.** The codebase has one style, enforced by formatters/linters
  in CI (doc 13), so style is never a review topic. **Why:** cognitive load drops when all code looks
  the same; review focuses on substance.
- **Clarity over cleverness.** Code is read far more than written and will be maintained by people who
  weren't there. Prefer the obvious implementation; name things for what they mean.
- **Small, single-responsibility units;** explicit over implicit; **no dead code** (delete it, git
  remembers).
- **Errors are handled explicitly and typed** (doc 12) — never swallowed, never stringly-typed.
- **Security idioms are the default:** parameterized queries only, validated input at boundaries,
  output filtered by permission, secrets from the secrets manager, classified data handled per its
  classification (docs 07/11). These are lint-enforced where possible.
- **No secrets, PII, or PHI in code, comments, tests, fixtures, or logs** — enforced by secret scanning
  and redaction (docs 11/12).
- **Comments explain *why*, not *what*;** the code says what. Public interfaces are documented.

**Backend (TypeScript / NestJS)**
- `strict` TypeScript; no `any` without justification; prefer immutable data; exhaustive handling of
  union/enum cases; DI and module boundaries per NestJS conventions (doc 01/16).
- Shared platform concerns (auth guard, tenant scope, audit interceptor, error mapping) come **from the
  platform libraries** (doc 17), never re-implemented per product.

**Client (Flutter / Dart)**
- `dart format` + the analyzer with a shared `analysis_options.yaml` (the repo already has one);
  consistent state-management approach across products (doc 18); shared design system components (docs
  17/18); no business/authz logic duplicated on the client that the server doesn't also enforce (the
  client is untrusted).

**Why enforce so much by tooling:** every rule a human must *remember* will eventually be forgotten on
a deadline. Rules a machine enforces are followed every time, freeing reviewers for judgment that tools
can't provide.

## 3. Testing standards (#20)

**The shape of the test suite (a pragmatic pyramid)**
- **Unit tests** (the base): fast, isolated, covering logic and edge cases — especially security and
  business rules. The bulk of tests.
- **Integration tests:** real database (with RLS), real module interactions; verify data-layer
  behavior, migrations, and that tenancy/authz actually work end to end within the service.
- **End-to-end tests:** the golden user journeys per product (log in with MFA, administer a medication,
  record a gift) against a production-like environment.
- **Contract tests:** API responses conform to the OpenAPI spec (doc 08); consumer-provider contracts
  hold across the seams that will become services (doc 01).

**Mandatory, non-negotiable test categories (these gate merges, doc 13):**
- **Tenant-isolation tests** — Tenant A cannot read/modify Tenant B (doc 04). The single most important
  test class in the platform.
- **Authorization tests** — each permission is enforced; deny-by-default holds; no endpoint is reachable
  without a declared guard (doc 03).
- **Audit tests** — sensitive actions produce the expected immutable audit events (doc 06).
- **Security regression tests** — for every fixed vulnerability, a test that fails if it returns.

**Standards & culture**
- **Coverage floor** (e.g. ≥80% overall, **higher for security-critical modules**) — but coverage is a
  *floor, not a goal*; we measure meaningful assertions, not lines touched. **Why the caveat:** chasing
  a coverage number produces assertion-free tests; the mandatory categories above matter more than the
  percentage.
- **Tests are deterministic;** flakes are bugs to be fixed or quarantined immediately (doc 13).
- **No production data in tests** — synthetic/anonymized only (doc 07).
- **Performance/load tests** for the paths with known scale pressure (doc 01 §5) before they hit it.
- **Accessibility tests** for UI (doc 18) — a11y is a requirement, not a nicety.
- **Tests are first-class code:** reviewed, refactored, and held to the same clarity standard as
  production code.

**Why this testing posture:** in a regulated platform, the tests are how we *prove* the security and
compliance properties continuously, not just at audit time. The mandatory categories turn the
architecture's promises (isolation, least privilege, immutable audit) into things that cannot silently
break. Everything else in testing serves confidence and speed; those categories serve survival.

## 4. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Standards drift** as the team grows and time passes. *Mitigation:* automate everything automatable
  (formatters, linters, gates), review the standards periodically, and keep them in-repo where they're
  visible and versioned.
- **Coverage-as-target gaming.** *Mitigation:* emphasize mandatory *categories* and assertion quality
  over the raw percentage; review test meaningfulness.
- **Review bottlenecks / rubber-stamping.** *Mitigation:* small PRs, CODEOWNERS for the risky areas,
  tracked review latency, and a culture that values review as real engineering work.
- **Heavy standards can slow a small team early.** *Mitigation:* the golden path and shared libraries
  make the standard the *easy* path; standards scale in enforcement as the team grows.
- **Test suite slowness** at scale. *Mitigation:* parallelization, test-impact analysis, tiering
  (doc 13).

**Tradeoffs accepted**
- Upfront rigor and slower individual changes in exchange for a codebase a changing team can safely own
  for decades. The alternative — moving fast without standards — is precisely how long-lived regulated
  systems become unmaintainable and insecure.
- One enforced style/stack reduces individual freedom; we accept that trade because consistency is worth
  more to the collective than expressiveness is to the individual here.

**Better alternatives if constraints differed**
- A tiny, stable team could operate on lighter, convention-based standards. We reject that because the
  premise is a **decades-long, changing** team, where written-and-enforced beats remembered.
- **Mutation testing** and **property-based testing** would raise assurance further on the crown-jewel
  logic (crypto, ledger math, authz); planned as an enhancement for those specific modules rather than a
  blanket requirement (cost/benefit).

---

*Prev: [13 — CI/CD Pipeline](13-cicd-pipeline.md) · Next: [15 — Compliance Readiness](15-compliance.md)*
