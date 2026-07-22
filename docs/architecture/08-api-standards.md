# 08 — API Standards

Covers brief item **#11 (API standards)**.

---

## 1. Primary style: resource-oriented HTTP/JSON (REST), contract-first via OpenAPI

The platform's external and product APIs are **RESTful JSON over HTTPS**, defined **contract-first**
in **OpenAPI 3.1**. The OpenAPI document is the source of truth; server DTOs, client SDKs (including
the Flutter clients), request validation, and documentation are **generated from it**.

**Why REST/JSON:**
- **Universally understood**, debuggable with a browser/curl, cacheable at the HTTP layer, and
  supported everywhere including Flutter and any future third-party integrator. For a decades-long,
  broadly-staffed platform, ubiquity and legibility beat cleverness (Principle 3).
- **Maps cleanly onto our resource/permission model** (doc 03): a resource + HTTP verb corresponds
  directly to a permission (`GET /genesis/members` ↔ `genesis.member.view`).

**Why contract-first (OpenAPI) rather than code-first:**
- The contract is a **reviewable artifact** decoupled from implementation; frontend, backend, and
  integrators agree on it before code exists.
- **Generated clients and validators** eliminate a whole class of drift bugs and keep the Flutter apps
  in lockstep with the backend.
- The contract doubles as **living documentation** and as input to security tooling and mock servers.

**Why not GraphQL as the default:** GraphQL is excellent for flexible client-driven queries, but it
complicates **caching, rate-limiting, authorization granularity, and audit** (the exact things we care
most about), and its flexible query surface is harder to reason about for tenant isolation and
least-privilege field access. We may expose a **GraphQL or BFF layer for specific read-heavy product
screens** later, backed by the same services — but the platform contract and its guarantees are REST.
Deferred and reversible.

**Internal service-to-service** (after extraction, doc 01): may use **gRPC** for typed, efficient
internal calls, but the *public/product* surface stays REST. Choosing gRPC internally does not leak to
clients.

## 2. Conventions (one consistent shape everywhere)

- **Versioning:** URL-major-version `/(v1)/...` with additive, backward-compatible changes within a
  version. Breaking changes → new major version, old version supported through a **published
  deprecation window**. **Why URL versioning:** it is the most obvious and cache-friendly; header
  versioning is subtler and error-prone for third parties.
- **Naming:** plural nouns for collections (`/members`, `/medications`), nesting for containment
  (`/camps/{id}/sessions`), verbs only for genuine actions that aren't CRUD (`/sessions/{id}:close`).
- **Pagination:** **cursor-based** by default (stable under inserts, scales), with page-size limits.
  Offset pagination is avoided for large/mutating collections.
- **Filtering/sorting:** explicit, documented query params; never accept raw query fragments from
  clients (injection surface).
- **Idempotency:** all unsafe mutations accept an **`Idempotency-Key`**; retries are safe and cannot
  double-charge a gift or double-administer a medication record. **Why:** networks retry; without
  idempotency, retries corrupt financial and medical data.
- **Errors:** a **single problem-details format (RFC 9457)**: stable machine `code`, human `message`,
  `request_id` (correlates to logs/audit, doc 12), and field-level validation details. Never leak
  stack traces or internal identifiers. Consistent errors across all products (doc 12).
- **Timestamps** ISO-8601 UTC; **money** as integer minor units + currency; **IDs** as UUIDv7
  strings (doc 07).
- **Content:** `application/json`; explicit request/response schemas; unknown fields rejected on
  write (strict) to catch client bugs early.

## 3. Security requirements on every endpoint (non-negotiable)

- **TLS 1.2+ only** (1.3 preferred), HSTS, no plaintext ever.
- **Authenticated by default**; a public endpoint must be *explicitly* marked public and justified.
  An endpoint with no declared authorization **fails closed and fails CI** (doc 03/13).
- **Authorization declared per endpoint** via the permission guard (doc 03), tenant scope enforced
  before handler logic (doc 04).
- **Input validation at the boundary** against the OpenAPI schema — reject before business logic.
- **Rate limiting & quotas per tenant and per identity** at the gateway (doc 01), with sensible
  burst allowances; protects against abuse and noisy neighbors.
- **Output filtering by permission:** responses are serialized through a layer that drops fields the
  caller may not see (doc 03), so a broad object never over-discloses.
- **No sensitive data in URLs** (they land in logs/proxies) — PHI/financial identifiers and secrets go
  in the body/headers, and IDs are non-enumerable UUIDs.
- **Audit hooks** on sensitive endpoints (doc 06) applied by a shared interceptor, not per-handler
  code.

**Why bake security into the API *standard* rather than leaving it to teams:** if every product team
re-decides auth, validation, rate limiting, and audit per endpoint, the platform's security posture
becomes the weakest team's discipline. Making these framework-enforced defaults means the secure path
is the default path.

## 4. Lifecycle, governance, and developer experience

- **Design review:** new/changed public contracts get a lightweight API review (naming, versioning,
  security, privacy classification of returned fields) before implementation.
- **Backward compatibility is a contract:** automated checks in CI diff the OpenAPI spec and **fail on
  breaking changes** within a major version (doc 13). Consumers (including Flutter apps) are protected
  from surprise breakage.
- **Generated, versioned SDKs** for Flutter/Dart and any partner languages, published from the spec.
- **Webhooks/events (outbound):** for integrations, signed (HMAC), retried with backoff, idempotent,
  and documented as first-class contracts — because ministries will want to connect FTS to other
  tools (accounting, email) and a poor webhook design becomes a support burden forever.
- **Sandbox & mock:** the OpenAPI spec powers a mock server and a sandbox tenant so integrators build
  without touching real data.

## 5. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **REST over-fetching/under-fetching** can force chatty clients or bespoke endpoints. *Mitigation:*
  sparse-fieldset support, purpose-built read models / BFF for heavy screens, optional GraphQL later.
- **Versioning discipline is a long-term tax** — supporting old majors costs. *Mitigation:* additive-
  only within a major, automated breaking-change detection, and a firm deprecation policy so old
  versions actually sunset.
- **Contract-first requires tooling investment** and can feel heavy for tiny endpoints. *Mitigation:*
  templates and generators make the common case cheap; the payoff is drift-free clients.
- **Idempotency and cursor pagination add implementation complexity.** *Mitigation:* provided by the
  shared library so products get them for free.

**Tradeoffs accepted**
- REST's simplicity and ubiquity over GraphQL's query flexibility — chosen because our dominant
  concerns (authz granularity, audit, caching, tenant isolation, integrator reach) favor REST, and we
  can add GraphQL selectively without changing the platform's guarantees.
- Strictness (reject unknown fields, fail-closed authz) can surface as friction — accepted, because
  loose APIs fail silently and dangerously.

**Better alternatives if constraints differed**
- If FTS's primary consumers were its own tightly-coupled first-party apps only (no third parties), a
  **GraphQL-first or tRPC-style** approach would improve first-party velocity. We reject it as the
  *platform* standard because integrators, caching, and per-field authorization/audit matter more over
  a decades horizon, but we keep the option open behind a BFF.
- **Async/event-first (event-sourced) public API** would suit very high-throughput, integration-heavy
  scenarios; overkill for the current portfolio and a steeper learning curve — reserved for specific
  internal flows (audit, notifications) rather than the general API.

---

*Prev: [07 — Data & Database Architecture](07-data-architecture.md) · Next: [09 — Notification Framework](09-notifications.md)*
