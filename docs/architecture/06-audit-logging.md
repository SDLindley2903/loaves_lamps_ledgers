# 06 — Immutable Audit Logging

Covers brief item **#6 (Immutable audit logging)**.

Audit logging is separate from operational logging (doc 12). **Operational logs** are for engineers
debugging; they are lossy, sampled, and short-lived. **Audit logs** are a *compliance record of who
did what to whose data*; they are complete, tamper-evident, and long-retained. Conflating the two is
a common and costly mistake, so they are different systems here.

---

## 1. What we record, and the guarantee we make

The platform records an **immutable, append-only, tamper-evident** trail of every
security- and compliance-relevant action. The guarantee: **any modification or deletion of an audit
record is either impossible or detectable.**

A canonical audit event is a structured record:

```
{
  event_id, occurred_at (server, UTC),
  tenant_id, actor { user_id | service_account_id, roles, session_id, ip, user_agent },
  action  (e.g. "campmed.medication.administer", "auth.mfa.challenge.failed"),
  resource { type, id },
  outcome (success | denied | error),
  reason  (for denials / break-glass),
  before / after  (field-level change, for mutations; PHI/PII redacted or referenced, not inlined),
  request_id (correlates to operational trace),
  prev_hash, hash   (tamper-evidence chain, §3)
}
```

**Events we always capture:** authentication (success/failure/MFA), authorization denials on
sensitive resources, all **PHI access and export** (HIPAA requires access logging, not just
changes), all financial transactions (Stewardship), RBAC changes, user lifecycle changes,
break-glass access, configuration/security-setting changes, data export/deletion, and admin actions.

**Why log reads for PHI/financial, not just writes:** HIPAA's access-log expectation and financial
controls care about *who looked*, not only who changed. Reading a camper's medication list is a
sensitive event. Most audit systems under-log reads; ours treats sensitive reads as first-class
events.

## 2. How immutability is achieved

Immutability is enforced by **multiple independent mechanisms** so that no single administrator,
including a database admin, can quietly alter history:

1. **Append-only at the application layer:** the audit API exposes only `append` and `query`. There
   is no update or delete path in code.
2. **Append-only at the database layer:** the audit table's DB role has `INSERT` and `SELECT` only;
   no `UPDATE`/`DELETE` grant. A rule/trigger rejects mutation. **RLS** still scopes reads by tenant.
3. **Written in the same transaction as the action** it records, so state changes and their audit
   entries commit or roll back together — audit can never silently drift from reality.
4. **Shipped to write-once external storage:** events are also streamed to an **immutable object
   store with Object Lock / WORM (S3 Object Lock in compliance mode)** and/or a managed immutable
   ledger. Even a full database compromise cannot rewrite the externally sealed copy.

**Why both in-DB and externalized WORM:** the in-DB append-only store gives fast, tenant-scoped
query for product features and access reviews; the externalized WORM copy gives the "even our own
DBAs cannot tamper with it" guarantee that auditors and regulators require. Neither alone is
sufficient; together they are strong.

## 3. Tamper-evidence: hash chaining

Each event stores a cryptographic hash of `(this event's canonical content ‖ previous event's
hash)`, forming a **hash chain per tenant (and a global chain)**. Periodically the chain head is
**sealed**: signed and/or anchored to the WORM store (and optionally to an external timestamping
authority).

**Why hash chaining:** it makes tampering *detectable* even where it cannot be made *impossible*. If
any historical event is altered or removed, every subsequent hash breaks, and verification fails at a
known point. This converts "trust our admins" into "verify the chain," which is exactly the property
SOC 2 and HIPAA auditors want to see and can test themselves.

## 4. Integrity, retention, and access

- **Retention:** audit data is retained per the **longest applicable obligation** (HIPAA generally 6
  years; some financial/education records longer; configurable per tenant/product). Retention is
  enforced by lifecycle policy, and early deletion is impossible under Object Lock until the term
  lapses.
- **Access to audit data is itself audited** and tightly restricted: tenant admins see their tenant's
  trail (read-only) via the shared UI; FTS platform auditors have a separate, logged path. No one has
  write access.
- **Verification tooling:** a job continuously verifies chain integrity and alerts on any break —
  turning tamper-*evidence* into tamper-*detection in near-real-time*, not just at audit time.
- **PII/PHI in audit:** sensitive values are **referenced or redacted**, not inlined, so the audit
  store does not itself become an uncontrolled copy of PHI. The event proves *that* a camper's
  medication record was accessed and by whom, without duplicating the medication details into a
  second sensitive store.

**Why redact/reference rather than inline sensitive data:** an audit log full of raw PHI is a second
breach target and complicates data-subject deletion. Referencing keeps the audit trail complete and
compliant without multiplying sensitive-data copies.

## 5. Delivery reliability

Audit writes are on the **critical path** for the recorded action (same transaction). For the
externalized copy and high-volume read events, we use a **durable, at-least-once queue** with dead-
lettering, and the append store is **idempotent on `event_id`** so retries cannot double-count.

**Why same-transaction for the primary write but async for the WORM copy:** we never want an action
to "succeed" without its audit record, so the primary audit write blocks the action. The externalized
seal can tolerate seconds of delay, so it is async — getting durability without adding latency-
coupling to a third-party store on every request.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Audit as a write-amplifier and hot path.** Every sensitive action does extra work. *Mitigation:*
  the audit sink is the **first extraction candidate** (doc 01) to a purpose-built, write-optimized
  service; partitioning by time/tenant; and it is exactly the workload that benefits from a Go
  service later.
- **Volume and cost** — logging reads (esp. PHI) generates a lot of data. *Mitigation:* tiered
  storage (hot → warm → WORM cold), redaction, and per-product tuning of what constitutes a
  "sensitive read."
- **Chain-break false positives** from bugs could cry wolf. *Mitigation:* careful canonicalization of
  event content, versioned hashing scheme, thorough tests.
- **Same-transaction coupling** means an audit-store outage could block actions. *Mitigation:* the
  primary audit store is the same Postgres as the action (so they share fate anyway); only the async
  externalization is decoupled.
- **Insider with DB + infra access** could attempt to rewrite both stores. *Mitigation:* WORM Object
  Lock in compliance mode prevents deletion even by the account owner until retention lapses; external
  timestamp anchoring; separation of duties on who holds those keys (doc 03 §3).

**Tradeoffs accepted**
- Performance and storage cost in exchange for a guarantee that is non-negotiable for a company
  handling PHI, minors' data, and money. This is the right place to spend.
- Complexity of a hash-chained, externally-sealed store over a simple log table — justified because
  "our logs are immutable" must be *true and provable*, not aspirational.

**Better alternatives if constraints differed**
- A **managed append-only ledger** (e.g. Amazon QLDB-style cryptographic ledger, or a compliance-
  focused audit SaaS) would offload the chaining/sealing machinery. We keep the *interface* generic so
  such a backend can replace our implementation; we start self-managed on Postgres+WORM to avoid early
  lock-in and to keep audit data under our own tenancy/RLS controls. Noted as **ADR-0007**.
- If no PHI/financial data were in scope, a lighter "changes-only, no read logging, 1-year retention"
  audit would be adequate and much cheaper. The portfolio's data classes rule that out.

---

*Prev: [05 — User Management](05-user-management.md) · Next: [07 — Data & Database Architecture](07-data-architecture.md)*
