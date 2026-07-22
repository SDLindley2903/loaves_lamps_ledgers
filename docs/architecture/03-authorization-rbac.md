# 03 — Authorization & Role-Based Access Control

Covers brief item **#4 (Role-based access control)**.

---

## 1. Model: RBAC as the core, scoped by tenant, with ABAC conditions at the edges

The platform authorization model is **role-based access control (RBAC)** where:

- **Permissions** are fine-grained, product-defined verbs on resources: `campmed.medication.administer`,
  `stewardship.fund.view`, `genesis.member.export`, `platform.rbac.manage`.
- **Roles** are named bundles of permissions: `CampNurse`, `MinistryAdmin`, `Treasurer`,
  `Volunteer`, `PlatformSupport`.
- **Assignments** bind `(user, role)` **within a tenant scope** — and optionally within a
  **sub-scope** (a specific camp, campus, ministry, or fund).
- **Attribute conditions (ABAC)** refine grants where roles alone are too coarse:
  "a CampNurse may administer medication **only for campers in a session they are staffed on**."

**Why RBAC as the backbone:**
- It maps directly to how ministries actually think ("nurses," "treasurers," "volunteers"), so
  admins can reason about access without training.
- It is the model SOC 2 and HIPAA auditors expect to see, and it produces clean access-review
  evidence ("show me everyone with the Treasurer role").
- Roles make **least privilege** administrable at human scale; per-user permissions do not.

**Why add ABAC conditions rather than pure RBAC:**
- Pure RBAC explodes into hundreds of near-duplicate roles ("NurseForCampA," "NurseForCampB") to
  express scoping. Attribute conditions (scope = this camp, ownership = this record) keep the role
  count small while still expressing real-world constraints. We get RBAC's legibility **and** ABAC's
  precision, applied only where needed.

**Why not full policy-as-code (e.g. OPA/Rego) as the primary model:** it is powerful but harder
for non-engineers to audit and reason about, and it moves authorization logic away from the domain.
We **may** adopt a policy engine internally for evaluation (§4), but the *mental model* exposed to
admins and auditors stays RBAC + scopes. Reversible: the engine is an implementation detail.

## 2. Role hierarchy & tenancy interaction

Roles exist at two levels:

- **Platform roles** (FTS-internal): `PlatformSuperAdmin`, `PlatformSupport`, `PlatformAuditor`,
  `PlatformBillingAdmin`. These are rare, heavily audited, and **break-glass** (see §5).
- **Tenant roles** (per organization): every product ships a set of **default roles** a tenant
  admin can use as-is, plus the ability to define **custom roles** from the permission catalog.

Roles support **inheritance** (a `MinistryAdmin` includes `Volunteer` permissions) to avoid
duplication, with a **strict rule: no permission is granted implicitly across products.** Holding
`Genesis.Admin` grants nothing in Stewardship. Cross-product access is always an explicit,
separate assignment.

**Why cross-product access is never implicit:** the products have different compliance
boundaries (CampMedMgr is PHI; Stewardship is financial). Implicit cross-product grants would let a
role quietly acquire access to a stricter data class. Explicitness keeps the compliance boundary
auditable.

## 3. Separation of duties & least privilege (baked into defaults)

- **Least privilege** is the default: new roles start with no permissions; new users get the
  lowest-capability role that lets them work.
- **Separation of duties (SoD)** constraints are declarable and enforced: e.g. in Stewardship, the
  user who **enters** a disbursement cannot be the one who **approves** it; the user who manages
  RBAC should not also be the sole auditor. SoD rules are evaluated at assignment time (warn/block)
  and surfaced in access reviews.
- **Just-in-time elevation** for administrative and platform actions: elevated roles are granted
  **time-boxed** and auto-expire, rather than standing forever.

**Why:** SoD and least privilege are explicit SOC 2 / HIPAA controls, and they materially reduce
insider-risk and blast radius. Time-boxed elevation means a compromised admin account is dangerous
for minutes, not indefinitely.

## 4. Where and how authorization is enforced

Authorization is enforced in **three layers** (defense in depth):

1. **Gateway / route layer** — coarse checks (is this token valid, does it carry the scope this
   endpoint requires). Cheap early rejection.
2. **Application guard layer** — the platform's `@RequirePermission('...')` guard (a NestJS guard)
   evaluates the full decision: role → permissions → ABAC conditions against the `SecurityContext`.
   **No product endpoint is reachable without passing through a guard**; a route with no explicit
   authorization declaration fails closed (deny) and fails CI (doc 13).
3. **Data layer** — **RLS in Postgres** enforces tenant scope structurally (doc 04), so even an
   authorization bug at the app layer cannot leak across tenants.

**Decision evaluation:** a central `AuthorizationService` answers `can(context, action, resource)`.
Decisions are **deny-by-default**, deterministic, and **logged** (every deny on a sensitive
resource is an audit event, doc 06). Decisions are cacheable per request; permission changes
**invalidate sessions** so revocation is prompt.

**Why deny-by-default and fail-closed:** the costliest authorization bugs are the ones where a
missing check silently *allows*. Fail-closed converts "forgot to add a check" from a data breach
into a broken feature caught in testing.

## 5. Break-glass / emergency access

Platform support occasionally must access a tenant to resolve an incident. This is handled by an
explicit **break-glass** flow: time-boxed, requiring a stated reason and (for PHI tenants)
secondary approval, generating a **high-visibility audit event** and a notification to the tenant.
Standing FTS-staff access to tenant data is **prohibited**.

**Why:** "our support staff can see everything" is both a HIPAA violation risk and the classic
insider-breach vector. Break-glass makes support access rare, consented where required, temporary,
and fully evidenced.

## 6. Administration & reviewability

- Tenant admins manage their own roles/assignments through a shared **Access Management UI**
  (part of the shared component library, doc 17).
- **Periodic access reviews** (quarterly, or per SOC 2 cadence) are a first-class feature: the
  platform can produce "who has what, where, granted by whom, last used when" for any tenant. Stale
  and unused grants are flagged for revocation.

**Why build access review in:** access recertification is a recurring SOC 2 requirement and a
perennial pain. Making it a product feature turns an audit scramble into a scheduled click.

## 7. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Role explosion** if teams reach for new roles instead of scopes/conditions. *Mitigation:*
  governance — a small permission catalog, ABAC conditions for scoping, and review of new default
  roles.
- **ABAC condition complexity** can make "why was I denied?" hard to answer. *Mitigation:* every
  decision is explainable (the guard can return the failing rule), and denials are logged.
- **Cache staleness** on permission change could briefly preserve revoked access. *Mitigation:*
  session invalidation on role change + short access-token TTL (doc 02).
- **Performance** of per-request evaluation with conditions. *Mitigation:* precomputed permission
  sets per session, RLS doing the heavy tenant filtering in the database.

**Tradeoffs accepted**
- RBAC+ABAC is more moving parts than flat RBAC, but flat RBAC cannot express our real scoping
  needs without role explosion. We accept modest complexity for correctness and a small role count.
- Enforcing at three layers is redundant by design; the redundancy is the point (defense in depth),
  at the cost of some duplicated intent.

**Better alternatives if constraints differed**
- **Google Zanzibar–style relationship-based access control (ReBAC)** (e.g. SpiceDB/OpenFGA) is
  the superior model if the portfolio grows deep hierarchical sharing ("this document is shared with
  this group in this ministry"). We **design the permission API so a Zanzibar-style backend can be
  swapped in** behind `AuthorizationService.can()` without changing product code. Deferred until a
  real relationship-graph need appears; noted as **ADR-0005**.
- Pure OPA/Rego policy-as-code if the team were policy-engineering heavy — rejected for admin/
  auditor legibility, retained as a possible internal evaluator.

---

*Prev: [02 — Authentication & MFA](02-authentication-mfa.md) · Next: [04 — Tenant Isolation](04-tenant-isolation.md)*
