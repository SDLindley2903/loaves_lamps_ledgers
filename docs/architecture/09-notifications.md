# 09 — Notification Framework

Covers brief item **#8 (Notification framework)**.

---

## 1. Decision: one platform notification service, channel-agnostic, provider-abstracted

All products send notifications through a **single shared Notification service** with a clean
separation of four concerns:

1. **Event** — something happened (`medication.due`, `gift.received`, `invitation.created`). Products
   emit events; they do **not** decide channels or format copy inline.
2. **Template** — versioned, localized content for an event, per channel.
3. **Preference & consent** — per-user, per-tenant, per-category opt-in/out and quiet hours.
4. **Delivery** — the channel adapter (email, SMS, push, in-app) that actually sends, via a
   pluggable provider.

**Why centralize and separate these concerns:**
- **Consistency and compliance in one place.** Unsubscribe handling (CAN-SPAM), consent (TCPA for
  SMS, HIPAA for PHI in messages), quiet hours, and localization are solved once. A product cannot
  accidentally send a non-compliant message because it never touches the send path directly.
- **Products stay declarative.** Emitting "medication.due" is simple and testable; the messy parts
  (retries, provider failover, rate limits, per-user preferences) live in the platform.
- **Providers are replaceable.** Email/SMS/push vendors change, get acquired, or raise prices. A
  provider-abstraction (adapter) makes swapping a vendor a config change, not a code migration across
  products.

## 2. Channels & providers

| Channel | Default provider (replaceable) | Notes |
|---|---|---|
| **Email** | Amazon SES (or SendGrid/Postmark) | Transactional + digest; DKIM/SPF/DMARC per sending domain |
| **SMS/Voice** | Twilio (or SNS) | Consent-gated (TCPA); never for PHI content, only "log in to view" |
| **Push** | APNs/FCM via a push adapter | For the Flutter apps |
| **In-app / inbox** | Platform-native | Durable, queryable, the safe channel for sensitive content |
| **Webhooks** | Platform-native (doc 08) | For tenant integrations |

**Why an in-app inbox is first-class and preferred for sensitive content:** email and SMS are outside
our security boundary and get forwarded, screenshotted, and breached. For PHI (CampMedMgr) and
financial detail (Stewardship), the compliant pattern is a **notification that says "you have an
update, sign in to view"** with the actual sensitive content only behind authentication. The in-app
inbox is that secure destination.

## 3. Delivery guarantees & mechanics

- **Asynchronous, queue-backed** delivery (doc 07 queue). Emitting an event is fast and decoupled from
  provider latency/outages.
- **At-least-once delivery with idempotency** (dedupe key per (user, event, channel)) so retries don't
  double-send.
- **Retries with exponential backoff and dead-letter** for undeliverable messages; **provider
  failover** where a secondary provider exists.
- **Rate limiting & digest/batching** to prevent notification storms (e.g. bulk import shouldn't fire
  10,000 individual emails; it batches or digests).
- **Scheduling & quiet hours** (respect tenant/user timezone; don't SMS a parent at 3am).
- **Full audit** (doc 06): what was sent, to whom, on what channel, with what outcome — without
  logging sensitive body content (reference, not inline).
- **Bounce/complaint handling:** hard bounces and spam complaints auto-suppress the address and are
  surfaced to admins; protects sender reputation and honors opt-out.

**Why async + idempotent + failover:** notifications are bursty (camp season, year-end giving) and
depend on flaky third parties. Decoupling protects the app's latency and correctness; idempotency and
failover protect the *user's* experience (no duplicates, no silent drops).

## 4. Preferences, consent, and tenant control

- **Categories** (transactional vs. informational vs. marketing) with granular per-user opt-in/out.
  **Transactional/safety messages** (medication reminders, security alerts) are **not** opt-outable in
  the same way marketing is — a distinction the framework enforces.
- **Consent capture** is tied to the consent records in user management (doc 05) — especially SMS
  (TCPA) and any messaging to/about minors (COPPA) and PHI (HIPAA).
- **Tenant-level branding & sender identity** (per-ministry from-address, logo, footer) so messages
  come from "First Church" not a generic FTS address, while still centrally compliant.
- **Localization/i18n** from day one (templates are localizable), because ministries serve multilingual
  communities.

**Why separate transactional from marketing at the framework level:** conflating them is how
platforms end up either spamming (legal risk) or suppressing safety-critical messages (medication
reminder lost to a marketing opt-out). The framework treats a medication reminder and a newsletter as
categorically different.

## 5. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Sensitive data leaking into messages.** The gravest risk: PHI/financial detail in an email/SMS.
  *Mitigation:* content classification on templates, a lint that blocks sensitive fields in
  external-channel templates, and the "sign in to view" pattern for restricted data.
- **Notification storms / self-DoS** from bulk operations. *Mitigation:* batching, digests, per-tenant
  rate limits.
- **Provider outage or reputation damage** (blacklisted sending domain). *Mitigation:* failover
  providers, per-tenant/subdomain sender isolation, bounce/complaint automation, DMARC monitoring.
- **Preference/consent complexity** — getting opt-out and TCPA/COPPA right is fiddly. *Mitigation:*
  centralized consent (doc 05), category model, and defaulting external channels to off for minors/PHI.
- **Delivery is best-effort by nature** — email/SMS can silently fail downstream. *Mitigation:* the
  durable in-app inbox is the authoritative channel; external channels are conveniences layered on top.

**Tradeoffs accepted**
- A central service is another platform component to build and operate, versus each product calling a
  provider SDK directly. We accept the upfront cost because compliant messaging is otherwise
  duplicated and inconsistently wrong across products.
- Async delivery means "sent" is eventual, not instant — acceptable, and the correct model for
  third-party-dependent I/O.

**Better alternatives if constraints differed**
- A **managed customer-messaging platform** (e.g. Courier, Knock, or a full CDP) could provide much of
  this off the shelf and accelerate delivery. We keep the *interface* compatible with adopting one, but
  build the thin orchestration ourselves initially to retain control over consent/audit/tenant-branding
  and to avoid piping PHI-adjacent data through another vendor prematurely. Revisit as volume grows.
- If only in-app notifications were needed (no email/SMS), the framework collapses to a simple inbox —
  but medication reminders and giving receipts require external channels, so the full framework is
  justified.

---

*Prev: [08 — API Standards](08-api-standards.md) · Next: [10 — File Storage Architecture](10-file-storage.md)*
