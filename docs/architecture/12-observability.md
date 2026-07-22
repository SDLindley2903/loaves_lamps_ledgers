# 12 — Observability, Logging, Monitoring & Error Handling

Covers brief items **#15 (Logging & monitoring)** and **#16 (Error handling)**.

Recall the deliberate split (doc 06): **audit logging** is a tamper-evident compliance record;
**operational observability** (this document) is for keeping the system healthy and debugging it.
Different systems, different guarantees. This document is about the operational side.

---

## 1. Instrumentation standard: OpenTelemetry, three signals

All services emit the three observability signals through **OpenTelemetry (OTel)**:

- **Structured logs** (JSON, never free-text) — what happened, with context.
- **Metrics** — aggregate numbers (latency, error rate, throughput, saturation).
- **Traces** — the path of a single request across components, tied together by a `request_id`/
  trace-id.

**Why OpenTelemetry:**
- **Vendor-neutral.** Instrumentation is written once, against an open standard, and can be shipped to
  *any* backend (Datadog, Grafana/Tempo/Loki/Mimir, Honeycomb, CloudWatch). Over a decades horizon we
  will change observability vendors; OTel means that is a config change, not a re-instrumentation
  project. This directly serves the anti-lock-in principle (Principle 3, ADR-0003).
- **Correlates the three signals** via shared trace context, so an alert (metric) links to the trace
  links to the exact logs — the difference between a 5-minute and a 5-hour incident.

## 2. Logging standards

- **Structured JSON logs** with a **standard envelope** on every line: `timestamp` (UTC),
  `service`, `env`, `severity`, `request_id`/`trace_id`, `tenant_id`, `user_id` (where present),
  `message`, and typed fields. **Why structured:** logs are data, not prose — queryable, alertable,
  and aggregatable. Free-text logs are unsearchable at 3am.
- **Correlation everywhere:** the `request_id` generated at the edge flows through logs, traces, the
  API error response (doc 08), and the audit record (doc 06). One id ties a user's error report to the
  exact server-side story.
- **Log levels used with discipline:** `error` (needs attention), `warn` (suspicious), `info` (key
  business/operational events), `debug` (dev only). Production defaults to `info`.
- **Mandatory redaction:** PII/PHI/secrets are **never** written to operational logs. A shared logging
  library redacts classified fields (doc 07/11) by default; this is enforced, not left to memory.
  **Why:** operational logs are widely accessible to engineers and shipped to third-party tools —
  putting PHI there would create an uncontrolled, non-compliant copy (the exact mistake doc 06 avoids).
- **Retention:** operational logs are short-to-medium lived (e.g. 30–90 days hot, longer cold if
  needed), unlike audit's multi-year retention — because their purpose is debugging, not evidence.
- **Tenant context on every log** so we can scope investigation to an affected tenant without trawling.

## 3. Metrics & monitoring

- **The four golden signals** per service: latency, traffic, errors, saturation. Plus business-level
  metrics (logins, medications administered, gifts processed) and platform metrics (audit-write lag,
  notification delivery rate, queue depth, RLS-denied anomalies).
- **SLOs with error budgets** for the user-facing critical paths (login, medication logging, giving).
  **Why SLOs, not just uptime:** an SLO defines "good enough" explicitly and ties alerting to
  *user-perceived* reliability, so we alert on symptoms users feel, not on noisy internal blips. Error
  budgets also mediate the pace-vs-stability tension (doc 13/14) with data instead of opinion.
- **Dashboards** per product and per platform capability, standardized so any on-call engineer can
  read any product's dashboard.
- **Health/readiness probes** on every service for orchestrator-driven self-healing.

## 4. Alerting & on-call

- **Alert on symptoms, page on user pain.** Alerts map to SLO burn and to security signals (doc 11):
  auth-failure spikes, authz-denial anomalies, break-glass use, audit-chain integrity failure, DR/
  backup failures. **Why symptom-based:** cause-based alerts (CPU high) generate noise; symptom-based
  alerts (checkout error budget burning) generate action.
- **Actionable alerts only** — every page has a **runbook** link (doc 13/14) and a clear owner. Alerts
  without a defined response are deleted; alert fatigue is treated as a defect.
- **Tiered severity** with defined response times, escalation, and a blameless **post-incident review**
  for every significant incident, feeding fixes back into the system.

## 5. Error handling standards (#16)

A single, consistent error philosophy across every product:

- **Typed errors, not strings.** Errors are typed values with a stable machine `code`, a category
  (validation / auth / not-found / conflict / rate-limit / dependency / internal), and whether they are
  **retryable**. **Why typed:** callers (and clients) can handle errors programmatically; a string
  message is unhandleable and unstable.
- **Fail fast, fail closed, fail explicit.** On ambiguity, deny/stop rather than guess (mirrors the
  security default). Never swallow an error into a silent wrong result — the worst failure is the one
  that looks like success (a medication logged that wasn't, a gift receipted that failed).
- **The API boundary maps internal errors to RFC 9457 problem-details** (doc 08): stable `code`,
  safe human `message`, `request_id`, field details for validation — and **never** leaks stack traces,
  SQL, or internal identifiers to clients. Full detail goes to logs/traces, keyed by `request_id`.
- **Resilience patterns for dependencies:** timeouts on every external call (no unbounded waits),
  **retries with exponential backoff + jitter** only for idempotent operations (doc 08), **circuit
  breakers** to shed load from a failing dependency, and **graceful degradation** (e.g. if
  notifications are down, the core action still succeeds and the notification is queued).
- **Idempotency** (doc 08) makes retries safe — the precondition for the retry patterns above.
- **User-facing errors are humane and actionable** (doc 18): clear language, a path forward, and a
  reference id the user can quote to support (which maps to `request_id`). No raw exceptions shown to a
  camp nurse or a church treasurer.
- **Errors are observable:** every handled error increments a metric and (if noteworthy) emits a log/
  trace; error-rate feeds SLOs and alerting. Unexpected errors flow to an **error-tracking system**
  (e.g. Sentry) with redaction, deduped and assigned.

**Why standardize error handling platform-wide:** inconsistent error handling is where reliability and
security quietly rot — swallowed exceptions hide data corruption, leaked internals aid attackers, and
per-team error shapes make clients brittle. One typed, fail-closed, observable standard makes the whole
platform debuggable and safe by default.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Observability data can itself leak sensitive data** if redaction fails. *Mitigation:* redact-by-
  default shared libraries, classification-driven (doc 07/11), tested; treat a PHI-in-logs finding as a
  security incident.
- **Cost and volume** of logs/traces at scale. *Mitigation:* sampling (esp. traces), log-level
  discipline, tiered retention, and cardinality control on metrics.
- **Alert fatigue** erodes response quality. *Mitigation:* symptom/SLO-based alerting, ruthless pruning
  of non-actionable alerts, runbook-per-alert requirement.
- **OTel maturity/overhead** varies by language. *Mitigation:* standard shared instrumentation in the
  platform libraries so products inherit correct tracing without per-team effort.
- **Fail-closed can reduce availability** (deny when a dependency is flaky). *Mitigation:* graceful
  degradation for non-critical paths, circuit breakers, and clear classification of which paths must
  fail closed (security/financial/medical) vs. degrade (cosmetic).

**Tradeoffs accepted**
- The cost of comprehensive instrumentation and redaction in exchange for fast, safe incident response
  — non-negotiable for a platform where an outage can mean a missed medication dose.
- Vendor-neutral OTel may lag a proprietary agent's out-of-box richness — accepted to avoid lock-in;
  we can still ship OTel data *to* a rich vendor.

**Better alternatives if constraints differed**
- An all-in-one proprietary APM (Datadog end-to-end) would be faster to stand up and richer initially —
  we can and may use it *as a backend* for OTel data, keeping instrumentation portable so the vendor
  stays replaceable. The instrumentation standard (OTel) and the vendor (backend) are deliberately
  decoupled.

---

*Prev: [11 — Security & Encryption](11-security-encryption.md) · Next: [13 — CI/CD Pipeline](13-cicd-pipeline.md)*
