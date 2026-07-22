# 17 — Shared Component Library

Covers brief item **#24 (Shared component library)**.

There are really **two** shared libraries in this platform, and it is important to name both:
a **backend platform library** (shared code for auth, tenancy, audit, etc.) and a **frontend design-
system / component library** (shared Flutter UI). Both exist for the same reason: solve a thing once,
consume it identically everywhere (Principle 6).

---

## 1. Backend platform library (`platform/*`)

The `platform/*` packages (doc 16) are the shared backend library every product builds on. A product
does **not** re-implement authentication, authorization, tenant scoping, audit, error handling,
notifications, storage, or observability — it **imports** them.

What the platform library provides, and why sharing it is non-negotiable:

- **Auth guard + `SecurityContext`** (doc 02/03) — so authorization is declared, not hand-rolled.
- **Tenant-scope middleware + RLS helpers** (doc 04) — so isolation is inherited, not remembered.
- **Audit interceptor** (doc 06) — so sensitive actions are logged uniformly and immutably.
- **API framework + error mapping + OpenAPI tooling** (doc 08/12) — so every endpoint has the same
  shape, validation, and error format.
- **Notification, storage, secrets, crypto, config, observability clients** (docs 09–12) — so every
  product handles these correctly by default.

**Why this is the heart of the platform strategy:** the shared backend library is *how* "secure and
compliant by default" (Principle 1) is actually delivered. If tenant isolation and audit are library
concerns applied by the framework, a product developer **cannot forget them** — the secure path is the
only path. This single design choice is what lets a new product be compliant in weeks (README §1).

## 2. Frontend design-system / component library (`clients/design-system`)

A shared **Flutter component library + design tokens** that every product's UI is built from. It
provides ready-made, accessible, on-brand building blocks:

- **Foundations / design tokens:** color, typography, spacing, elevation, radius, motion — as a single
  source of truth (details in doc 18).
- **Primitives:** buttons, inputs, selects, checkboxes, date/time pickers, toasts, dialogs, cards.
- **Composite components:** data tables (with the platform's cursor pagination, doc 08), forms with
  validation wired to API error shapes, empty/loading/error states, file-upload widget (wired to the
  presigned-URL flow, doc 10), notification inbox (doc 09).
- **Platform-aware components:** the **login/MFA flow**, **access-management UI** (doc 03), **audit-log
  viewer** (doc 06), **consent-capture** widgets (doc 05), and **tenant switcher** (doc 05) — the UI for
  the platform capabilities, shared so every product presents them identically and correctly.

**Why a shared design system:**
- **Consistency across the portfolio** — a ministry using Genesis and Stewardship experiences one FTS,
  not four disjoint apps. Familiarity reduces training and support load.
- **Accessibility and security done once.** WCAG conformance (doc 18) and secure UI patterns (e.g. the
  correct token-handling login flow, safe file upload) are built into the components, so no product
  ships an inaccessible form or an insecure upload by accident.
- **Velocity.** A new product assembles screens from tested components instead of rebuilding primitives,
  which is where most UI bugs and inconsistencies come from.

## 3. How the libraries are built and governed

- **Versioned within the monorepo** (doc 16); consumers always build against the current version, and
  breaking changes land atomically with their consumers (the monorepo payoff).
- **Documented and demonstrable:** the design system ships with a **living gallery / storybook** (a
  runnable catalog of every component, its states, and usage), and the backend library ships with
  reference usage and generated API docs. **Why:** a shared library nobody can discover or understand
  gets bypassed; discoverability is what makes reuse actually happen.
- **Owned, with a contribution path:** clear ownership (CODEOWNERS, doc 14) plus a defined way for
  product teams to propose additions, so the library evolves with real needs instead of ossifying or
  forking.
- **Tested to the platform standard** (doc 14), including accessibility tests for UI components and the
  mandatory security tests for platform library code.
- **Tokens are the contract** between design and code (doc 18) — designers change tokens, code consumes
  them, so brand/theme changes propagate without per-component edits.

## 4. The governance tension (and how we resolve it)

A shared library has a built-in tension: **too rigid** and teams fork or route around it; **too
permissive** and it becomes an inconsistent grab-bag. We resolve it with a **layered model**:

- **Locked layer** — security/compliance-critical pieces (login/MFA, audit viewer, tenant scope, file
  upload). Products **must** use these; they are not customizable in unsafe ways. *Why locked:* these
  encode correctness we cannot let a product get wrong.
- **Themed layer** — visual components that adapt via tokens (doc 18) to per-tenant branding but keep
  behavior/accessibility fixed. *Why:* ministries want their brand; we allow look, not broken behavior.
- **Composable layer** — primitives products freely assemble into product-specific screens. *Why:*
  products need freedom where it's safe.

**Why this layering:** it grants freedom exactly where freedom is harmless and enforces sharing exactly
where inconsistency would be dangerous or wasteful. This is the pragmatic answer to the perennial "why
won't teams use the shared library?" problem.

## 5. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Shared library as a bottleneck** — every product waits on the library team. *Mitigation:* the
  composable layer + a contribution path so teams can extend without gatekeeping; ownership focuses on
  the locked/themed layers.
- **Over-abstraction** — a component so generic it's hard to use. *Mitigation:* build components from
  real product needs (extract-after-two-uses), not speculative generality; the gallery keeps them
  honest.
- **Breaking-change blast radius** — a bad change hits every product. *Mitigation:* the monorepo's
  atomic change + full test suite catches breakage before merge; versioned tokens for visual changes.
- **Divergence/forking pressure** if the library lags product needs. *Mitigation:* responsive ownership,
  clear contribution model, and the layered freedom model above.

**Tradeoffs accepted**
- Central coordination cost and some loss of per-product UI freedom in exchange for consistency,
  accessibility, security-by-default, and velocity across the portfolio. For a multi-product company
  presenting one brand, this is clearly worth it.
- Investment in a gallery/storybook and governance overhead — justified because an undiscoverable or
  ungoverned shared library fails in practice regardless of its quality.

**Better alternatives if constraints differed**
- **Publishing the design system as an independent, versioned package** (with a design-tokens standard
  and multi-framework output) is the right move if FTS ever adds non-Flutter clients (a pure web app,
  partner integrations). We keep tokens framework-neutral (doc 18) so this remains a cheap future step.
- A single tiny product would not justify a full design system; the multi-product, one-brand,
  accessibility-and-compliance-driven reality of the portfolio is exactly what makes it pay off.

---

*Prev: [16 — Repository & Folder Structure](16-repository-structure.md) · Next: [18 — UI Design Standards](18-ui-design-standards.md)*
