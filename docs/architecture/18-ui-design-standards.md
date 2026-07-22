# 18 — UI Design Standards

Covers brief item **#25 (UI design standards)**.

The users of these products are camp nurses on a phone with poor signal, church treasurers, ministry
volunteers of every age and technical comfort, and families with children. The UI standards are written
for **that** audience: clarity, accessibility, trust, and reliability over visual fashion.

---

## 1. Design principles

1. **Clarity over cleverness.** The interface should be obvious to a non-technical volunteer with no
   training. Plain language, clear hierarchy, one primary action per screen.
2. **Accessible by default (non-negotiable).** We build to **WCAG 2.2 AA** as a floor. Accessibility is
   a requirement and a test (doc 14), not an enhancement.
3. **Trustworthy and calm.** These products handle health, children, and money. The visual tone is
   calm, honest, and unflashy; we never use dark patterns, false urgency, or manipulative design —
   especially not around giving (Stewardship) or consent (minors).
4. **Consistent across the portfolio.** One design language so the products feel like one family
   (doc 17). A pattern learned in Genesis works the same in Stewardship.
5. **Resilient and forgiving.** Clear loading/empty/error states, confirmation for destructive or
   irreversible actions, undo where possible, and graceful behavior on poor connectivity.
6. **Content-first and humane.** Microcopy is written for humans; errors tell the user what happened and
   what to do (doc 12), never expose internals.

**Why these principles specifically:** the cost of a confusing or inaccessible UI here is not a lost
sale — it can be a missed medication, a mis-recorded gift, or a family excluded by a screen reader that
doesn't work. Clarity and accessibility are safety and inclusion concerns, not aesthetics.

## 2. Design tokens (the single source of truth)

All visual decisions are expressed as **design tokens** — named, themeable values — consumed by the
shared component library (doc 17), never hard-coded in a product:

- **Color:** a semantic palette (`surface`, `on-surface`, `primary`, `danger`, `success`, `warning`,
  `focus`) rather than raw hex in components. Semantic naming means theming and per-tenant branding
  change tokens, not components.
- **Typography:** a limited, legible type scale (readable defaults, generous sizes — many users are
  older); no more than two font families.
- **Spacing, radius, elevation, motion, breakpoints:** all tokenized on a consistent scale.
- **Theming:** light and dark themes, and **per-tenant brand theming** (a ministry's colors/logo) —
  all via tokens, with **contrast validated automatically** so a tenant's brand color can never produce
  an inaccessible combination.

**Why tokens:** they are the contract between design and engineering (doc 17). A brand refresh, a dark-
mode fix, or a tenant's colors propagate everywhere by changing tokens — no per-screen edits, no drift.
And validating contrast at the token level makes "accessible" structural rather than per-designer
diligence.

## 3. Accessibility standards (concrete, testable)

- **WCAG 2.2 AA**: color-contrast minimums (auto-checked on tokens), full **keyboard navigability**,
  visible focus states, correct semantics/labels for screen readers (Flutter semantics), sufficient
  touch-target sizes, and respect for OS text-scaling and reduced-motion settings.
- **Never rely on color alone** to convey meaning (icons/text accompany color) — for color-blind users
  and for clarity.
- **Forms are accessible and forgiving:** labels (not just placeholders), inline validation tied to API
  error shapes (doc 08), clear required-field indication, and error summaries.
- **Accessibility is tested in CI** (doc 14): automated checks plus periodic manual screen-reader
  testing. A component that fails a11y does not ship.

**Why hold a hard a11y line:** ministries serve everyone, including elderly and disabled members; an
inaccessible product excludes people from their community's tools, and for education/public-serving
contexts it is also a legal exposure. Making a11y a gated test is the only way it survives deadline
pressure.

## 4. Interaction & content standards

- **One primary action per screen;** secondary actions visually subordinate. Reduce choices to reduce
  errors.
- **Destructive/irreversible actions** (delete a member, void a gift, remove a medication) require
  **explicit confirmation** with clear consequences, and prefer **undo** over prevention where safe.
  For truly sensitive actions, this pairs with step-up auth (doc 02) and audit (doc 06).
- **Feedback for every action:** immediate, clear success/failure; never leave the user guessing whether
  something happened (critical for a nurse logging a dose).
- **Offline & poor-connectivity behavior** (CampMedMgr especially): clear offline indicators, safe local
  queueing where appropriate, and honest sync status — never silently lose a nurse's input.
- **Microcopy standards:** plain language, consistent terminology (a shared glossary), respectful tone,
  and error messages that are humane and actionable with a support reference id (doc 12).
- **Internationalization:** all UI text is localizable from day one (doc 09); layouts tolerate text
  expansion and right-to-left.

## 5. Responsive & multi-platform

- **Flutter** (doc 01) targets mobile, web, and desktop from one codebase; the design system defines
  **responsive breakpoints** and adaptive layouts so each product works from a phone at a campsite to a
  desktop in a church office.
- **Platform conventions respected** where they matter (native gestures, back behavior) while keeping a
  consistent FTS identity.

**Why one design system across platforms:** it delivers a coherent experience everywhere without
maintaining separate UIs, and it means accessibility and security patterns are implemented once.

## 6. Governance

- The design system and tokens are **owned and versioned** (doc 17), with a living **component gallery**
  as the reference.
- **Design reviews** for new patterns keep the language coherent; new patterns get promoted into the
  shared system rather than living as product one-offs (avoiding drift).
- Design and engineering share the **token contract**, so the two never diverge.

## 7. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **A shared design language can feel generic** or constrain a product's distinct needs. *Mitigation:*
  the composable layer (doc 17) and per-tenant theming allow expression within safe bounds.
- **Accessibility rigor slows some UI work.** *Mitigation:* accessible components by default (doc 17) so
  teams inherit a11y instead of re-earning it; automated checks catch regressions cheaply.
- **Per-tenant theming can break contrast/branding integrity.** *Mitigation:* automated contrast
  validation on tenant tokens; constrain *which* tokens tenants may override.
- **Design/engineering drift** if tokens aren't truly the single source. *Mitigation:* enforce token-
  only styling in components (lint), no raw values in product UI.
- **Offline UX is genuinely hard** and easy to get subtly wrong (data loss). *Mitigation:* treat offline
  behavior for CampMedMgr as a first-class, tested design concern, not an edge case.

**Tradeoffs accepted**
- Consistency and accessibility constraints over per-product visual freedom — the right trade for a
  multi-product, all-ages, safety-sensitive, one-brand portfolio.
- Calm/plain aesthetics over trendy visuals — deliberately, because trust and clarity outlast fashion,
  and these products must feel dependable for decades.

**Better alternatives if constraints differed**
- A **bespoke, product-specific design** per app would maximize individual polish — rejected because it
  multiplies accessibility/security/maintenance work and fragments the brand. We keep tokens framework-
  neutral so the design language could later power non-Flutter surfaces (doc 17) if the portfolio
  expands beyond Flutter.
- If a product were aimed at a narrow, expert audience, denser/more-advanced UI could be justified; our
  audience (volunteers, all ages, non-technical) makes clarity-first the correct default.

---

*Prev: [17 — Shared Component Library](17-shared-component-library.md) · Next: [Decision Records](adr/README.md)*
