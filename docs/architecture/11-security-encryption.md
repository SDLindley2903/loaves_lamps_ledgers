# 11 — Security Architecture & Encryption Standards

Covers brief items **#12 (Security architecture)** and **#13 (Encryption standards)**.

Security is not a component; it is a property of the whole system. This document ties together the
security decisions distributed across the other documents and states the encryption standards
explicitly.

---

## 1. Security philosophy

- **Zero trust:** no network location is trusted. Every request is authenticated and authorized
  (docs 02/03), including service-to-service calls. There is no "trusted internal network" where
  checks are skipped.
- **Defense in depth:** every critical property (tenant isolation, authz, audit integrity) is
  enforced by **multiple independent layers**, so no single bug or misconfiguration is catastrophic.
- **Least privilege everywhere:** users, roles, service accounts, DB roles, and cloud IAM all get the
  minimum they need (docs 03/05/07).
- **Secure by default, fail closed:** the default is the safe configuration; ambiguity denies (doc 03).
- **Assume breach:** design so that a compromise of one component (an app server, a cache, a single
  key) is contained and detected, not fatal.

**Why state a philosophy, not just controls:** over decades, specific controls will be replaced;
the philosophy is what keeps replacements aligned. New engineers inherit the *why*, not just a
checklist.

## 2. Defense-in-depth layers (map of where each control lives)

| Layer | Controls | Detailed in |
|---|---|---|
| **Edge** | CDN, WAF (OWASP rules), DDoS protection, TLS termination, rate limiting | doc 01/08 |
| **Network** | Private subnets, security groups, no public DB/cache, VPC endpoints, egress control | this doc §6 |
| **Identity** | Central OIDC, MFA, short-lived tokens, session revocation | doc 02 |
| **Authorization** | RBAC+ABAC guards, deny-by-default, SoD, break-glass | doc 03 |
| **Tenant isolation** | `tenant_id` + RLS + storage/cache/queue scoping | doc 04 |
| **Application** | Input validation, output filtering, CSRF/XSS/SSRF defenses, secure headers | §3 |
| **Data** | Encryption at rest/in transit/field-level, classification, retention | §4–5 |
| **Audit** | Immutable, hash-chained, WORM-sealed trail | doc 06 |
| **Operations** | Secrets management, patching, monitoring, incident response | §6–8, doc 12 |

## 3. Application security standards

- **OWASP Top 10 and ASVS** are the baseline; the platform is built to **ASVS Level 2** (Level 3 for
  the PHI/financial paths). **Why ASVS:** it is a concrete, testable standard we can certify against
  and cite in SOC 2, rather than a vague "we care about security."
- **Injection:** parameterized queries only (ORM/query-builder), no string-built SQL; RLS as a
  backstop even against injection (doc 04).
- **XSS:** output encoding by default; Flutter's rendering model reduces DOM-XSS, and web endpoints
  set a strict **Content-Security-Policy** and secure headers (HSTS, X-Content-Type-Options,
  Referrer-Policy, frame-ancestors).
- **CSRF:** SameSite cookies + anti-CSRF tokens for cookie-authed web flows (doc 02).
- **SSRF:** egress allow-listing; user-supplied URLs (webhooks, imports) are validated and fetched
  through a guarded proxy — critical because SSRF against cloud metadata is a top breach vector.
- **Deserialization / file upload:** strict schemas (doc 08), the upload safety pipeline (doc 10).
- **Secrets never in code or logs:** enforced by secret-scanning in CI (doc 13) and log redaction
  (doc 12).
- **Dependency & supply-chain security:** SCA scanning, pinned/locked dependencies, SBOM generation,
  signed builds, and provenance (doc 13). **Why:** the software supply chain is now a primary attack
  vector; a decades-long platform must know exactly what it ships.

## 4. Encryption standards (#13)

**In transit**
- **TLS 1.2 minimum, 1.3 preferred**, strong ciphers only, HSTS enforced, no plaintext protocols.
- Internal service traffic is also TLS (mTLS after service extraction) — zero-trust, no plaintext even
  "inside."

**At rest**
- **AES-256** for all data at rest: database (RDS/Aurora KMS encryption), object storage (SSE-KMS,
  doc 10), backups, caches with persistence, and search indices.
- **Envelope encryption via a managed KMS:** a root key (CMK) in KMS wraps per-purpose/per-tenant
  **data keys**. Data keys encrypt data; the CMK never leaves the HSM-backed KMS.

**Field-level / application-layer encryption**
- The most sensitive fields (select PHI in CampMedMgr, financial account identifiers, secrets/tokens
  at rest in the app domain) are **encrypted at the application layer** *before* they reach the
  database, so they are opaque even to a DBA or a database-level compromise.
- **Tokenization** for payment data (Stewardship): we **never store raw card/bank numbers**; a PCI-
  compliant processor tokenizes them and we store only tokens — keeping card data out of our scope
  entirely (doc 15).

**Key management**
- **Per-tenant data keys** for siloed/PHI tenants (docs 04/10) enable **crypto-shredding** on deletion.
- **Automated key rotation** on a defined schedule; rotation re-wraps data keys without re-encrypting
  all data (envelope encryption's payoff).
- **Separation of duties on keys:** no single engineer can both access production data and export/
  delete its keys; key operations are audited (doc 06).
- **HSM-backed** root keys (KMS/CloudHSM) — private key material is non-exportable.

**Why these choices:**
- **Envelope encryption + managed KMS** gives HSM-grade key protection, cheap rotation, and per-tenant
  isolation without us building crypto infrastructure (Principle 3 — don't hand-roll cryptography).
- **Field-level encryption for the crown jewels** means "the database was breached" is not
  automatically "PHI was disclosed."
- **Tokenization over storing card data** shrinks PCI scope from "the whole platform" to "a narrow
  integration," which is the single biggest cost/risk reduction available for payments.

## 5. Data classification drives crypto (doc 07 §4)

Encryption strength and location follow classification: **Restricted/PHI** → field-level + per-tenant
key; **Confidential/PII/financial** → KMS-encrypted at rest + TLS; **Secret** → secrets manager only,
never in the app DB. One classification declaration configures the right protection automatically.

## 6. Infrastructure & network security

- **Everything private by default:** databases, caches, and queues have **no public endpoints**; only
  the edge (CDN/WAF/gateway) is internet-facing. Access is via private subnets/VPC endpoints.
- **Secrets management:** all secrets in **AWS Secrets Manager / KMS**, injected at runtime, rotated,
  never in env files committed to git, never in images. Short-lived cloud credentials (IAM roles), not
  static keys.
- **Least-privilege IAM** for every service and human; no shared admin accounts; MFA on all cloud
  console access; break-glass for elevated cloud access (mirrors doc 03).
- **Immutable infrastructure:** servers are cattle, not pets — replaced from images via IaC (doc 13),
  not patched in place, so drift and long-lived compromised hosts are designed out.
- **Patch/vulnerability management:** automated dependency and OS patching cadence, tracked SLAs by
  severity, continuous vulnerability scanning.

## 7. Detection & response

- **Security monitoring** feeds a SIEM: auth anomalies, authz-denial spikes, break-glass use, audit-
  chain breaks (doc 06), impossible-travel, exfil-shaped access patterns (doc 12).
- **Alerting** on the security-critical signals with defined on-call ownership.
- **Incident response plan** (documented, rehearsed): severity classification, containment, forensics
  (the immutable audit trail is the forensic backbone), **breach-notification workflows** (HIPAA 60-day,
  GDPR 72-hour, state laws) wired to the compliance obligations (doc 15).
- **Regular testing:** internal security review on every change (threat-modeling for sensitive
  features), periodic **third-party penetration tests**, and a **responsible-disclosure/bug-bounty**
  channel.

**Why invest in detection and a rehearsed IR plan:** "assume breach" is only meaningful if we can
*detect* and *respond*. Regulators judge breach *handling* as much as breach *prevention*; a rehearsed,
documented response is both a compliance requirement and what limits real-world damage.

## 8. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Field-level encryption breaks query/search** on encrypted fields and adds latency/complexity.
  *Mitigation:* encrypt only the true crown jewels; use blind-indexes/HMAC for equality lookups where
  needed; accept that some fields are simply not searchable (correct for PHI).
- **Key management is now a critical dependency** — losing a tenant key destroys data (that is the
  point for shredding, a disaster if accidental). *Mitigation:* KMS durability guarantees, strict
  controls and audit on key deletion, multi-party authorization for destroy operations.
- **Zero-trust internal comms (mTLS)** add operational overhead. *Mitigation:* deferred until service
  extraction; the monolith reduces internal surface early.
- **Security controls add friction** that teams may route around. *Mitigation:* make the secure path
  the *default, easiest* path via shared libraries (docs 03/08/17), so security is inherited, not
  bolted on.
- **A determined insider with broad access** remains the hardest threat. *Mitigation:* SoD, least
  privilege, break-glass, immutable audit, and key-destroy multi-authorization reduce (never eliminate)
  it.

**Tradeoffs accepted**
- Performance and developer-friction costs of encryption, RLS, and zero-trust in exchange for a posture
  appropriate to PHI, minors' data, and money. For this portfolio, that is the correct trade.
- Managed KMS/cloud crypto over self-managed HSMs — less control, far less risk of us mishandling key
  material.

**Better alternatives if constraints differed**
- **Confidential computing / end-to-end encryption** (data encrypted such that even FTS cannot read it)
  would be the gold standard for PHI — but it breaks most product functionality (you can't schedule a
  medication you can't read) and is impractical for the collaborative features these products need.
  Reserved for narrow cases (e.g. sealed document vaults).
- A dedicated **third-party security platform / managed SOC** could accelerate detection maturity; we
  plan to adopt managed detection tooling rather than build a SOC, while owning the audit trail and IR
  process ourselves.

---

*Prev: [10 — File Storage Architecture](10-file-storage.md) · Next: [12 — Observability & Error Handling](12-observability.md)*
