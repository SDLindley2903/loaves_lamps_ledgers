# 05 — User Management

Covers brief item **#7 (User management)**.

---

## 1. The identity/membership split (the key modeling decision)

We separate two concepts that are frequently and damagingly conflated:

- **User (identity):** a person, globally unique across FTS, with one set of credentials and MFA.
  Modeled once in the Identity service (doc 02).
- **Membership:** the link between a User and a **Tenant**, carrying that user's roles, scopes,
  status, and profile *within that organization*.

A single person can therefore be a **CampNurse in one camp, a Treasurer in a church, and a parent
in Kindling** — one login, many memberships, distinct permissions in each.

**Why split identity from membership:**
- Real ministry life is many-to-many: pastors serve multiple congregations, staff work several
  camps, families use consumer and admin products. A user-per-tenant model would force duplicate
  accounts, duplicate MFA, and duplicate password resets — a security and UX failure.
- It keeps **credentials centralized** (one place to secure) while keeping **authorization
  tenant-scoped** (doc 03/04). This is the cleanest way to get SSO across the portfolio without
  leaking access across tenants.
- Offboarding a user from one organization must not delete them from others. The split makes
  "remove from this tenant" and "delete the person" cleanly distinct operations.

## 2. User lifecycle

**Invitation-first onboarding (default):** users are **invited** into a tenant by an admin, with a
role pre-assigned, via a time-limited signed invitation. On acceptance they either create an
identity or attach an existing one. **Why invitation-first:** for regulated products, open
self-signup into an existing organization is a data-exposure risk; the tenant controls who joins.
Self-service signup is available for tenant *creation* and for consumer products (Kindling) where
appropriate.

Lifecycle states, all audited (doc 06): `invited → active → suspended → deactivated → deleted`,
plus `locked` (security) and `pending-verification`.

- **Suspension** immediately revokes sessions (doc 02) and blocks login while preserving data — the
  reversible "turn off access now" control.
- **Deactivation** ends a membership (person left the ministry); their historical records
  (who administered a medication, who recorded a gift) are **retained and attributed**, never
  deleted, because that history is compliance evidence.
- **Deletion** of a person is a separate, heavier, privacy-driven operation (§4).

**Why retain attribution after deactivation:** HIPAA and financial controls require knowing *who
did what*. Deleting a departed nurse would orphan medication-administration records. We deactivate
the membership but keep the immutable attribution.

## 3. Profiles, minors, and consent

- **Minimal profile by default**; products extend it. Profile fields are **classified** (PII, PHI,
  none) so downstream controls (encryption, export, audit) know how to treat each field (doc 15).
- **Minors** are first-class: Kindling and CampMedMgr manage data about children. The model
  supports **guardian relationships**, guardian-managed accounts, and **verifiable parental consent**
  (COPPA), plus age-gating. A child's record is linked to guardian(s) who hold consent and access
  rights.
- **Consent records** (parental consent, HIPAA authorizations, communication opt-ins) are stored as
  first-class, versioned, audited objects — not booleans on a profile.

**Why model consent as versioned objects:** "did this parent consent, to what version of what, and
when?" is a question COPPA/HIPAA auditors and courts ask. A boolean cannot answer it; a versioned,
timestamped, audited consent record can.

## 4. Self-service, admin tooling, and privacy rights

- **Self-service:** users manage their own profile, credentials, MFA factors, sessions ("sign out
  everywhere"), and see their own access ("which organizations can I access and as what").
- **Tenant admin tooling** (shared UI, doc 17): invite/suspend/deactivate members, assign roles
  (doc 03), run access reviews, and handle their tenant's data-subject requests.
- **Privacy rights (GDPR/CCPA + FERPA):** the platform provides **data export** (portable format)
  and **deletion** for a person, with legal-hold override and the tenant-scoped nuance that deleting
  a person from Tenant A does not remove their still-consented data in Tenant B. FERPA education
  records (if Genesis/education applies) get their access/amendment workflow.

**Why build export/deletion into user management now:** these are legal obligations across
multiple regimes, they are hard to bolt on later, and getting them wrong (deleting compliance
records, or failing to delete on request) creates liability. Designing them into the lifecycle is
far cheaper than retrofitting.

## 5. Service accounts & machine identities

Non-human actors (integrations, background jobs, product-to-product calls) are modeled as
**service accounts / machine identities** with their own scoped credentials (OAuth2 client-
credentials), roles, and audit trail — never shared human logins. **Why:** shared human credentials
for automation is a top audit finding and destroys attribution. Machine identities keep the "who
did what" chain intact for automated actions too.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **The identity/membership split adds a join** to nearly every access decision. *Mitigation:* the
  membership + roles are resolved once per request into the `SecurityContext` and cached for the
  request.
- **Account linking/merging** (same person, two identities created) is fiddly and a known source of
  security bugs (account-takeover via merge). *Mitigation:* verified-email/verified-factor gating on
  any merge, fully audited, never automatic for privileged accounts.
- **Consent/guardian modeling is genuinely complex** and easy to under-build. *Mitigation:* treat it
  as a core platform capability with dedicated review, not a product afterthought.
- **Deletion vs. retention tension** — privacy law says delete, compliance law says retain.
  *Mitigation:* field-level classification + legal-hold + tenant-scoped deletion so we can honor both
  by deleting what we may and retaining what we must, with the decision documented per field.

**Tradeoffs accepted**
- More upfront modeling complexity (users, memberships, consents, guardians) in exchange for
  correctly supporting the messy real world of multi-org, multi-role, minor-inclusive ministry. A
  simpler user-per-tenant model would be cheaper now and wrong within a year.

**Better alternatives if constraints differed**
- If every product were single-tenant and adults-only, a flat "user has a role" model would be
  dramatically simpler and sufficient. We reject it because CampMedMgr (minors + PHI) and multi-org
  ministry make it unworkable.
- Fully delegating profile/lifecycle to the external IdP (SCIM-driven provisioning) is attractive
  for enterprise-SSO tenants; we **support SCIM inbound** for those tenants while keeping our own
  membership model as the authority for tenant-scoped roles.

---

*Prev: [04 — Tenant Isolation](04-tenant-isolation.md) · Next: [06 — Immutable Audit Logging](06-audit-logging.md)*
