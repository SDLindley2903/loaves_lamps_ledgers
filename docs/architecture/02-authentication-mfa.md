# 02 — Authentication & Multi-Factor Authentication

Covers brief items **#2 (Authentication)** and **#3 (Multi-factor authentication)**.

---

## 1. Decision: one platform-owned Identity Provider (IdP), speaking OIDC/OAuth2

All products authenticate against a **single, central FTS Identity service**. Products never
implement their own login, password handling, or MFA. They receive **signed tokens** and trust
them.

**Why a central IdP rather than per-product auth:**
- **One security floor.** Password policy, MFA enforcement, lockout, breach response, and session
  revocation are implemented once and apply everywhere. A vulnerability is fixed in one place.
- **Single sign-on across the portfolio.** A ministry using Genesis and Stewardship expects one
  account and one login. Central identity makes SSO the default, not a project.
- **One audit trail for authentication** — essential for SOC 2 (CC6) and HIPAA access-control
  evidence.
- **Products stay simple.** A product team should never touch a password hash. Removing that
  responsibility removes a whole class of vulnerabilities from every product.

**Why OIDC/OAuth2 (open standards) rather than a bespoke token scheme:**
- Battle-tested, formally analyzed, and supported by mature libraries on every platform including
  Flutter. We do not invent cryptographic protocols (Principle 3).
- Interoperable with external IdPs, which we will need (see §6, enterprise SSO / social login).

## 2. Build vs. buy the IdP

**Decision: buy/adopt a proven identity engine; own the policy and the data.**

We do **not** hand-roll an identity server. We stand up a hardened, well-supported identity
system — evaluated candidates: **Keycloak (self-hosted, open source), Ory (Hydra/Kratos), AWS
Cognito, Auth0/Okta (managed)**. The default recommendation is:

- **Start on a managed IdP (AWS Cognito or Auth0)** to reach production and SOC 2 fastest with
  the least operational risk, **behind our own thin identity facade** so the vendor is replaceable.
- **Reserve Keycloak/Ory** as the self-hosted path if per-user managed pricing or data-residency
  requirements make managed untenable at scale.

**Why buy first:** identity is the highest-consequence, most attacked component. Reaching a
*correct* implementation of OIDC, token rotation, and MFA is expensive and unforgiving. A managed
provider gives us a compliant baseline immediately.

**Why the facade:** managed IdPs create lock-in and can become expensive at millions of users. A
thin FTS identity facade (our own `/auth/*` API in front of the provider) means the provider is a
**reversible** decision (Principle 4). Products only ever talk to the facade. Captured as
**ADR-0004**.

## 3. Tokens & sessions

- **Access token:** short-lived (**≤15 min**) JWT, signed with a rotating asymmetric key (RS256/
  EdDSA). Carries `sub` (user), `tid` (tenant), `roles`/`scope`, `sid` (session), `amr` (auth
  methods incl. whether MFA was satisfied), and standard expiry claims. **Stateless** — verified
  by signature at the gateway, no per-request database hit.
- **Refresh token:** long-lived, **opaque**, stored server-side, **rotated on every use** with
  reuse detection. If a refresh token is presented twice, the whole session family is revoked
  (indicates theft).
- **Session record:** server-side, enabling **immediate revocation** (logout-everywhere, admin
  force-logout, on role change). This is the deliberate counterweight to stateless access tokens:
  short access-token TTL bounds the window in which a revoked-but-not-yet-expired token still works.

**Why short-lived access + rotating opaque refresh:**
- Stateless access tokens give us horizontal scale (doc 01 §5) with no session-store lookup on the
  hot path.
- The ≤15 min TTL bounds the blast radius of a leaked access token.
- Refresh rotation with reuse detection turns token theft into a **detectable, self-revoking**
  event rather than a silent compromise.

**Token storage on clients:** never in web `localStorage` (XSS-exposed). Web uses **HttpOnly,
Secure, SameSite cookies** for the refresh token; native Flutter apps use the platform secure
keystore (Keychain / Keystore). Access tokens live in memory only.

## 4. Credentials & password handling

- **Argon2id** for password hashing (memory-hard; resists GPU cracking). Fallback bcrypt(cost≥12)
  only if a platform constraint forbids Argon2.
- **Breached-password screening** against a k-anonymity range API (e.g. HaveIBeenPwned model) at
  set-time. We reject known-compromised passwords instead of imposing arbitrary composition rules.
- **NIST SP 800-63B-aligned policy:** minimum length (≥12), no forced periodic rotation (rotation
  without cause harms security by encouraging weak, incremented passwords), no silly composition
  rules, screen against breach lists and context-specific words.
- **Account lockout / throttling:** exponential backoff + IP/user rate limiting + CAPTCHA step-up
  on anomaly, not naive "lock after 5" (which enables trivial denial-of-service against a victim).

**Why NIST-aligned and not "classic" complexity rules:** the classic rules (quarterly rotation,
symbol requirements) are now understood to *reduce* real-world security. Aligning to 800-63B is
both more secure and directly citable as a control in SOC 2 / HIPAA evidence.

## 5. Multi-factor authentication (#3)

### Policy

- **MFA is mandatory for:** all staff/administrative accounts, all users of **CampMedMgr**
  (PHI access), and any user with elevated roles in any product. This is a **default-on**,
  tenant-overridable-only-upward policy: a tenant admin can require *more* MFA, never less than the
  platform floor.
- **MFA is offered to and encouraged for all users**, and can be required per-tenant.
- **Step-up MFA** is required for high-risk actions regardless of session age: viewing/exporting
  PHI, editing RBAC, bulk data export, changing payout/banking info in Stewardship, and any
  destructive admin action.

### Supported factors, in order of preference

1. **Passkeys / WebAuthn (FIDO2)** — phishing-resistant, hardware-backed. **The strategic
   default** we push users toward.
2. **TOTP authenticator apps** (RFC 6238) — offline, no telecom dependency, widely understood.
3. **Push-based approval** (via our own app) — good UX, requires care against "MFA fatigue"
   (number-matching required).
4. **SMS/voice OTP** — **supported but deprecated-by-design**; offered only as a fallback and never
   as the sole factor for PHI/financial access, because SMS is SIM-swappable and interceptable.

Every MFA enrollment issues **one-time recovery codes**, stored hashed, shown once.

**Why this ordering:**
- **Passkeys are phishing-resistant**; phishing is the dominant real-world credential-theft
  vector. Prioritizing WebAuthn attacks the actual threat rather than checking a box.
- **TOTP as the pragmatic baseline** works offline (critical for camps with poor connectivity —
  CampMedMgr) and has no per-message cost or telecom dependency.
- **SMS is included but demoted** because regulators and NIST both flag it as weak; we keep it only
  to avoid locking out low-tech users, never for the sensitive paths.

### Adaptive / risk-based authentication

Login risk is scored on device recognition, geo/IP reputation, impossible-travel, and behavioral
anomalies. Low risk → normal factor; elevated risk → forced step-up or block. **Why:** it puts
friction where the risk is instead of taxing every login, which improves both security and UX.

## 6. External identity: enterprise SSO and social login

- **Enterprise SSO (SAML 2.0 / OIDC) inbound** so a large church, camp network, or school can use
  their own IdP (Google Workspace, Microsoft Entra, Okta). **Why:** larger customers require it,
  and it moves credential risk to their IdP. This is a sales and security win.
- **Social login (Google/Apple)** for consumer-grade products (Kindling family accounts). Apple
  is required if we offer other social logins on iOS. **Why:** reduces password sprawl for
  low-sensitivity accounts; never permitted alone for PHI/financial access.

Both flow **through the facade**, so products see one identity model regardless of source.

## 7. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Central IdP is a single point of failure and the crown-jewel target.** If it is down, nothing
  logs in. *Mitigation:* Multi-AZ, aggressive SLOs, cached JWKS for signature verification so
  existing sessions survive a brief IdP outage; the IdP gets the strictest security review.
- **Stateless access tokens can outlive a revocation** by up to their TTL. *Mitigation:* ≤15 min
  TTL + server-side sessions for hard revocation; step-up re-checks on sensitive actions.
- **MFA fatigue / push bombing.** *Mitigation:* number-matching, rate-limited prompts, and pushing
  users toward passkeys which are immune to this.
- **Recovery flows are the soft underbelly** — account recovery is where MFA is bypassed in the
  real world. *Mitigation:* recovery requires equivalent assurance (recovery codes, verified
  secondary factor, or admin-assisted verified reset with full audit); never a single emailed link
  for privileged accounts.

**Tradeoffs accepted**
- Managed IdP cost and lock-in vs. speed and compliance — mitigated by the facade.
- Short token TTL means more refresh traffic — a cheap price for a bounded compromise window.

**Better alternatives if constraints differed**
- If FTS had deep identity expertise and cost pressure at scale, **self-hosted Keycloak/Ory from
  day one** would avoid managed lock-in — rejected initially only for speed-to-compliance.
- A fully **passwordless-only** platform (passkeys + magic links, no passwords at all) is the
  likely long-term end state and is *architecturally supported now*; we retain passwords initially
  because a portion of our user base (older, less technical congregations) is not passkey-ready.

---

*Prev: [01 — System Architecture](01-system-architecture.md) · Next: [03 — Authorization & RBAC](03-authorization-rbac.md)*
