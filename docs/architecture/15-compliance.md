# 15 — Compliance Readiness (SOC 2, HIPAA, FERPA, PCI, COPPA, GDPR/CCPA)

Covers brief item **#21 (Compliance readiness, where applicable)**.

**Philosophy: compliance is a byproduct of good engineering, not a separate project.** Almost every
control an auditor asks for is already produced by the architecture in the preceding documents. This
document maps obligations to the mechanisms that satisfy them, so that "getting certified" is largely
"collecting evidence the system already generates."

> This document is engineering guidance, not legal advice. Actual scope and obligations must be
> confirmed with qualified counsel and each product's real data practices. Product-domain assumptions
> (README §2) drive which regimes apply; correct them and this mapping updates.

---

## 1. Which regime applies to what

| Regime | Trigger | Primary products | Status |
|---|---|---|---|
| **SOC 2 (Type II)** | Selling B2B SaaS handling customer data | **All** | Baseline for the whole platform |
| **HIPAA** | Protected Health Information | **CampMedMgr** (camper meds/health) | Strictest data-handling tier |
| **FERPA** | Education records | Genesis/Kindling **if** tied to a school/education program | Conditional on domain |
| **PCI DSS** | Card/payment data | **Stewardship** (giving) | Minimized via tokenization |
| **COPPA** | Data from children under 13 | **Kindling**, **CampMedMgr** | Guardian consent + minimization |
| **GDPR / CCPA/CPRA** | EU/California data subjects | **All** (if such users exist) | Data-subject rights baked in |
| **State privacy & breach laws** | Varies | All | Covered by the breach + privacy machinery |

**Why design to the union up front (README §2):** the portfolio already spans PHI, minors, and money.
Building the strict controls into the shared platform once, and *relaxing per product where a regime
doesn't apply*, is far cheaper and safer than retrofitting HIPAA-grade controls onto a permissive base
later. Strict-by-default, relax-by-exception.

## 2. Data classification & scoping (the mechanism that contains compliance)

Compliance scope is controlled by **data classification** (doc 07 §4) and **tenant tiering** (doc 04):

- PHI (CampMedMgr) is classified **Restricted**, can be **siloed** (doc 04) into `compliance-prod`
  (doc 01), field-encrypted (doc 11), and read-audited (doc 06). This **keeps HIPAA scope off the
  products that don't need it** — Genesis's membership DB is not dragged into HIPAA just because
  CampMedMgr exists.
- Payment data is **tokenized** (doc 11) so raw card data never enters our systems, shrinking PCI
  scope to a narrow integration.
- Classification decides encryption, audit depth, retention, export/delete behavior, and which
  environment a workload runs in.

**Why classification is the linchpin of compliance:** it turns "is this system in scope for HIPAA/PCI?"
from a vague, whole-platform question into a precise, field-and-tenant-level answer. Auditors can see
exactly where regulated data lives and how it's contained.

## 3. Obligation → mechanism map (evidence the system already produces)

| Requirement (common across regimes) | Satisfied by | Doc |
|---|---|---|
| Access control / least privilege / RBAC | Central authz, RBAC+ABAC, deny-by-default, SoD | 03 |
| Unique identity, MFA, strong auth | Central IdP, mandatory MFA for PHI/admin | 02 |
| Tenant / customer data isolation | `tenant_id` + RLS + storage/cache scoping | 04 |
| Audit trail of access & changes (incl. PHI *reads*) | Immutable, hash-chained, WORM audit | 06 |
| Encryption at rest & in transit | AES-256 + TLS 1.2+, KMS envelope, field-level | 11 |
| Access reviews / recertification | Built-in periodic access-review feature | 03 |
| Change management | Reviewed PRs, gated pipeline, auto change records | 13/14 |
| Vulnerability & patch management | SAST/DAST/SCA, patch SLAs, immutable infra | 11/13 |
| Backup & recoverability | PITR, cross-region, tested restores | 07 |
| Monitoring & incident detection | OTel + SIEM + alerting | 12/11 |
| Incident response & breach notification | Documented, rehearsed IR + notification workflows | 11 |
| Data-subject rights (access/export/delete) | User-management export/deletion, crypto-shred | 05/04 |
| Retention & disposal | Class-based retention, WORM, lifecycle automation | 06/07/10 |
| Vendor / subprocessor management | BAAs/DPAs, subprocessor register (§5) | this doc |
| Consent (parental, PHI authorization, messaging) | Versioned consent records | 05/09 |

**The point of this table:** for nearly every control, the answer to "how do you comply?" is "the
platform does it by default, and here is the automated evidence." That is what makes certification
tractable for a small team.

## 4. Regime-specific notes

**SOC 2 (Trust Services Criteria).** The baseline for all products. Security is mandatory; we also
target Availability (SLOs/DR, docs 12/07) and Confidentiality (encryption/classification, doc 11).
Type II requires evidence *over time* — which the pipeline, audit trail, monitoring, and access reviews
generate continuously. Aim: policies + automated evidence collection so audits are low-friction.

**HIPAA (CampMedMgr).** Requires **BAAs** with all subprocessors touching PHI (AWS, providers),
technical safeguards (access control, audit, encryption, integrity, transmission security — all above),
administrative safeguards (workforce training, IR, risk assessments), the **60-day breach
notification** rule (doc 11), and the **minimum-necessary** principle (least privilege, doc 03). PHI is
siloable and read-audited. **Why silo PHI:** it caps the HIPAA blast radius and keeps other products
out of scope.

**FERPA (conditional).** If Genesis/Kindling serve education programs, education records get access-
control, the parent/eligible-student **access and amendment** rights, and disclosure logging — which
the audit trail (doc 06) and user-management rights (doc 05) already provide. Flagged conditional
because it depends on the (assumed) domain.

**PCI DSS (Stewardship).** We **do not store cardholder data**; a PCI-compliant processor tokenizes
payments (doc 11). This targets **SAQ-A / minimized scope** rather than full PCI on our platform — the
largest single risk/cost reduction available for handling money.

**COPPA (Kindling, CampMedMgr minors).** **Verifiable parental consent**, data minimization for under-
13s, no behavioral advertising, guardian access/deletion — via the consent + guardian model (doc 05)
and restricted messaging to minors (doc 09).

**GDPR/CCPA/CPRA.** Lawful-basis/consent tracking, data-subject access/export/deletion/portability
(doc 05), data-residency pinning (doc 04), breach notification (72h, doc 11), and a subprocessor
register. Built in as **rights**, not bolt-ons.

## 5. Vendor / subprocessor governance

- A maintained **subprocessor register** (AWS, email/SMS/push providers, error-tracking, etc.), each
  with the appropriate **BAA (HIPAA)** or **DPA (GDPR)** in place before it touches regulated data.
- **Data-flow / data-map** documentation: what data of what classification flows to which subprocessor
  and why. **Why:** every regime asks "who else touches this data?"; maintaining the map continuously
  beats reconstructing it under audit pressure, and it forces the discipline of not sending PHI/PII to a
  vendor without the right agreement (docs 09/12 redaction supports this).

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Compliance scope creep** — a new feature quietly pulling PHI into a non-HIPAA product/environment.
  *Mitigation:* classification-gated data flows, siloing, and design review that checks classification
  for sensitive features (doc 14).
- **Certification is ongoing, not one-time** — controls can drift out of compliance. *Mitigation:*
  automated, continuous evidence (pipeline/audit/monitoring), and periodic internal audits.
- **Assumption risk** — some obligations here hinge on domain assumptions (FERPA especially). *Mitigation:*
  every conditional obligation is flagged; confirm domains with product owners and counsel.
- **Over- or under-scoping** either wastes effort or creates legal exposure. *Mitigation:* classification
  makes scope explicit and reviewable rather than guessed.
- **Human/administrative controls** (training, policy) sit outside code and are easy to neglect.
  *Mitigation:* treat policies, training, and IR rehearsals as tracked, scheduled obligations, not
  documents that rot.

**Tradeoffs accepted**
- Strict-by-default imposes cost on products that may not need every control — accepted because relaxing
  is cheap and retrofitting strictness is not, and because it keeps a single coherent security posture.

**Better alternatives if constraints differed**
- A **compliance-automation platform** (Vanta/Drata/Secureframe-style) can continuously collect evidence
  and manage policies; strongly recommended to adopt as the org pursues formal SOC 2/HIPAA attestation —
  it complements (does not replace) the engineering controls here.
- If the portfolio never touched PHI/payments/minors, most of this document would collapse to "SOC 2 +
  privacy basics." The portfolio's actual data classes are what justify the full breadth.

---

*Prev: [14 — Engineering Standards](14-engineering-standards.md) · Next: [16 — Repository & Folder Structure](16-repository-structure.md)*
