# 13 — CI/CD Pipeline

Covers brief item **#17 (CI/CD pipeline)**.

The pipeline is where most of this architecture's guarantees become *enforced* rather than *hoped
for*. Tenant-isolation tests, authorization-declared-everywhere, no-secrets-in-code, breaking-API
detection — these are only real because the pipeline blocks merges that violate them.

---

## 1. Principles

- **Everything as code, everything reviewed.** Application, infrastructure (Terraform), pipeline
  definitions, and policies all live in version control and go through pull requests. No console
  clicks change production. **Why:** reproducibility, auditability (a SOC 2 change-management control),
  and the ability to recreate any environment from git.
- **The pipeline is the enforcement point.** Quality, security, and compliance gates are automated and
  **blocking**, not advisory. A human can't forget a check the machine runs every time.
- **Fast feedback, then thorough gates.** Cheap checks (lint, unit) run first and fast; expensive ones
  (integration, security scans, e2e) run before merge/deploy. Developers get signal in minutes.
- **Immutable, promoted artifacts.** Build **once**, produce a signed immutable artifact, and
  **promote the same artifact** dev → staging → prod. **Why:** "the thing we tested is the thing we
  ship" — rebuilding per environment reintroduces the drift the pipeline exists to prevent.

## 2. Pipeline stages (what runs, and why it gates)

**On every pull request (must pass to merge):**
1. **Lint & format** (doc 14) — style is automated, not argued about in review.
2. **Type check** — TypeScript/Dart type safety as a gate.
3. **Unit tests** with a **coverage floor** (doc 14), heavily weighted to security-critical code.
4. **Tenant-isolation & authorization tests** (docs 03/04) — cross-tenant access attempts must be
   denied; endpoints without a declared authorization guard **fail the build**. *This is the gate that
   makes the platform's core promise non-regressable.*
5. **Secret scanning** — block any committed credential/key (doc 11).
6. **SAST** (static application security testing) — code-level vulnerability scan.
7. **SCA / dependency scan** — known-CVE and license checks on dependencies (doc 11 supply chain);
   **SBOM** generated.
8. **API contract check** — diff the OpenAPI spec; **fail on breaking changes** within a major version
   (doc 08).
9. **IaC scan** — Terraform security/policy checks (no public buckets, encryption on, no wildcard IAM).
10. **DB migration checks** — migrations are forward-only, backward-compatible (expand/contract),
    and include the required `tenant_id`/RLS on new tenant-owned tables (docs 04/07).
11. **Build** the immutable, **signed** artifact + provenance attestation (supply-chain integrity).

**On merge to main → staging:**
12. **Integration & end-to-end tests** against a production-like staging (doc 01), including the golden
    user journeys per product.
13. **DAST** (dynamic scan) against staging.
14. Automated **deploy to staging**, smoke tests, and (periodically) the DR restore drill (doc 07).

**Promotion to production:**
15. **Progressive delivery:** canary / blue-green rollout with automated health checks against SLOs
    (doc 12); **automatic rollback** on error-budget burn or failed health checks.
16. **Change record** auto-generated for the audit/compliance trail (who deployed what, when, with
    which approvals) — SOC 2 change-management evidence produced as a byproduct.

**Why this ordering and these gates:** each gate corresponds to a specific risk this architecture
takes seriously — tenant leakage, missing authz, leaked secrets, vulnerable dependencies, breaking
clients, insecure infra, unsafe migrations. Automating them means the platform's security posture is
the *pipeline's* discipline, not the weakest reviewer's attention on a busy day.

## 3. Deployment strategy

- **Trunk-based development** with short-lived feature branches and frequent small merges behind
  **feature flags**. **Why:** small changes are safer, easier to review, faster to roll back, and keep
  the branch designated for this work (and future work) close to main. Long-lived branches accumulate
  risky, hard-to-review divergence.
- **Feature flags** decouple *deploy* from *release*: code ships dark and is enabled progressively per
  tenant/cohort, enabling safe rollout and instant kill-switch without a redeploy.
- **Blue-green / canary** for zero-downtime deploys and fast rollback.
- **Environment promotion** dev → staging → prod with the **same artifact** and the **same Terraform**
  (different variables), so higher environments are faithful.
- **Rollback is a first-class, tested path** — every deploy is reversible, including via forward-fix or
  artifact re-promotion; DB changes are expand/contract so rollback never requires a destructive
  down-migration.

## 4. Security & compliance of the pipeline itself

- **Least-privilege CI:** the pipeline uses short-lived, scoped cloud credentials (OIDC federation),
  never long-lived keys. Production-deploy permissions are separated from build permissions (SoD).
- **Protected branches & required reviews:** merges to main require passing checks **and** review
  (with **CODEOWNERS** for security-sensitive areas — auth, RBAC, tenancy, crypto — requiring a
  security reviewer, doc 14).
- **Signed commits & signed artifacts**, provenance attestation (supply-chain integrity, doc 11).
- **The pipeline is auditable:** every build/deploy is logged immutably; this *is* the change-
  management evidence for SOC 2.
- **Secrets** are injected from the secrets manager at deploy time (doc 11), never stored in CI config.

**Why harden the pipeline as much as production:** the CI/CD system can deploy to production, so it is
a production-tier asset. A compromised pipeline is a compromised platform (a well-known supply-chain
attack pattern). It gets the same least-privilege, SoD, and audit treatment as prod.

## 5. Tooling (default, replaceable)

- **CI/CD:** GitHub Actions (this repo already uses it) — reassess GitLab CI/others only if a concrete
  limitation appears. Pipeline logic is kept mostly in **portable scripts/containers** so the CI vendor
  is not deeply coupled.
- **IaC:** Terraform (doc 01). **Containers:** OCI images. **Registry:** signed images with retention.
- Scanners: SAST/DAST/SCA/secret-scanning/IaC-scanning integrated as pipeline steps (specific vendors
  are reversible choices).

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Slow pipelines kill velocity** and tempt people to bypass gates. *Mitigation:* parallelism,
  caching, tiered checks (fast first), and treating pipeline speed as a tracked SLO.
- **Flaky tests erode trust** in the gates. *Mitigation:* zero-tolerance flake policy — quarantine and
  fix; a gate people ignore is worse than no gate.
- **CI as a high-value attack target.** *Mitigation:* least-privilege OIDC creds, SoD on deploy,
  signed artifacts, audited pipeline (§4).
- **Gate friction** may pressure teams to weaken checks. *Mitigation:* make the compliant path the
  default and fast; changes to the gates themselves require security review.
- **GitHub Actions coupling.** *Mitigation:* portable scripts/containers keep migration cost low.

**Tradeoffs accepted**
- More upfront pipeline engineering and slightly slower merges in exchange for making the platform's
  security/compliance guarantees automatic and non-regressable. For a regulated, decades-long platform
  this is decisively worth it.
- Trunk-based + feature flags adds flag-management overhead versus long-lived branches — accepted,
  because flags give safe progressive rollout and instant kill-switch, which branch-based releasing
  cannot.

**Better alternatives if constraints differed**
- A **fully managed internal developer platform** (e.g. an opinionated PaaS or a tool like a managed
  Backstage + golden paths) could standardize pipelines further as the org grows — a natural evolution
  once there are many products/teams; premature for the current size.
- **GitOps (Argo/Flux)** for declarative, pull-based deploys is attractive once we run Kubernetes at
  scale (doc 01) — deferred with the same trigger as adopting Kubernetes itself.

---

*Prev: [12 — Observability & Error Handling](12-observability.md) · Next: [14 — Engineering Standards](14-engineering-standards.md)*
