# 16 — Repository & Folder Structure

Covers brief items **#22 (Folder structure)** and **#23 (Repository structure)**.

---

## 1. Repository strategy: a platform monorepo, product apps as packages

FTS uses a **monorepo** for the shared platform and the products that depend on it, with a disciplined
internal package structure. Client apps (Flutter) and backend (TypeScript) live in the same repository,
organized by clear boundaries.

**Why a monorepo:**
- **Atomic cross-cutting change.** A change to a shared platform library (auth, tenancy, audit) and
  every product that consumes it can land in **one reviewed, tested commit**. With separate repos, that
  same change becomes a multi-repo version-bump dance that invites drift and "which product is on which
  version of the security library?" — unacceptable when the shared library *is* the security posture.
- **One source of truth for standards** (linting, CI, ADRs, the design system) applied uniformly.
- **Discoverability.** Engineers see the whole platform; shared code is found and reused instead of
  reinvented (Principle 6).
- **Consistent tooling and CI** (doc 13) across everything.

**Why not many repos (polyrepo):** polyrepo suits independent teams shipping loosely-coupled services
on independent cadences. Our defining constraint is the opposite — many products sharing a security-
critical core that must stay in lockstep. Polyrepo would scatter the platform's guarantees across
version boundaries. We revisit only if truly independent, separately-governed products emerge.
Captured as **ADR-0008**.

**Guardrails that make the monorepo scale:** enforced module boundaries (a product may depend on
`platform/*` but **not** on another product's internals — checked in CI), code ownership
(CODEOWNERS, doc 14), and **build/test-impact analysis** so CI only rebuilds what a change affects
(doc 13). These prevent the classic monorepo failure modes (tangled dependencies, slow CI).

## 2. Top-level repository layout

```
faithtrail/                          # monorepo root
├── README.md
├── docs/
│   ├── architecture/                # THIS documentation set
│   └── adr/                         # cross-cutting decision records
├── platform/                        # the shared enterprise platform (the substrate)
│   ├── identity/                    # authN, tokens, MFA, sessions (doc 02)
│   ├── authorization/               # RBAC/ABAC engine, guards (doc 03)
│   ├── tenancy/                     # tenant context, RLS helpers (doc 04)
│   ├── users/                       # identity/membership, lifecycle, consent (doc 05)
│   ├── audit/                       # immutable audit sink + verification (doc 06)
│   ├── data/                        # DB access, migrations tooling, classification (doc 07)
│   ├── api/                         # API framework, OpenAPI tooling, error mapping (doc 08)
│   ├── notifications/               # notification service (doc 09)
│   ├── storage/                     # file storage + safety pipeline (doc 10)
│   ├── security/                    # crypto, secrets, headers, common defenses (doc 11)
│   ├── observability/               # OTel setup, logging, error handling (doc 12)
│   └── config/                      # typed configuration, feature flags
├── products/
│   ├── campmedmgr/
│   ├── genesis/
│   ├── kindling/
│   └── stewardship/
├── clients/                         # Flutter apps + shared UI
│   ├── design-system/               # shared component library + tokens (docs 17/18)
│   └── <app-per-product or shared shell>
├── packages/                        # shared cross-language contracts & generated SDKs
│   ├── api-contracts/               # OpenAPI specs (source of truth, doc 08)
│   └── sdk-dart/ sdk-ts/            # generated clients
├── infra/                           # Terraform (all environments), IaC modules (doc 13)
├── tools/                           # dev tooling, generators, scripts, CI helpers
└── .github/                         # pipelines, CODEOWNERS, templates (doc 13/14)
```

**Why this shape:** the top level reads as the architecture — `platform/` is the shared substrate,
`products/` are thin apps on top, `clients/` is the UI, `packages/` holds the contracts that bind them,
`infra/` is the environment. A newcomer can map any concept in this documentation to a directory in
seconds. The dependency rule is visible and one-directional: `products → platform → (data/security)`,
never sideways between products.

## 3. Standard structure *inside* a backend module (one shape everywhere)

Every `platform/*` and `products/*` backend module follows the **same internal layout**, so any
engineer can navigate any module:

```
<module>/
├── api/            # controllers/routes, request/response DTOs, OpenAPI annotations
├── domain/         # entities, value objects, domain services (framework-agnostic business logic)
├── application/    # use-cases/handlers orchestrating domain + ports
├── infrastructure/ # repositories, DB mappings, external adapters (implements ports)
├── ports/          # interfaces the module exposes and depends on (the seams, doc 01)
├── migrations/     # DB migrations owned by this module (doc 07)
├── events/         # domain events emitted/consumed
├── config/         # module configuration schema
└── tests/          # unit + integration + the mandatory isolation/authz/audit tests (doc 14)
```

**Why a ports-and-adapters (hexagonal) layout:**
- It keeps **business logic (`domain/`) free of framework and database details**, so the rules that
  matter most are testable in isolation and survive infrastructure changes over decades.
- **`ports/` are the extraction seams** (doc 01): a module talks to others only through ports, so when
  a module graduates to its own service, the port becomes a network client with no change to callers.
- The uniform shape means **"where does X go?" has one answer** across the whole codebase, cutting
  cognitive load and review friction (doc 14).

## 4. Flutter client structure

The Flutter side (building on the existing `lib/` in this repo) follows a **feature-first** structure
with a shared core:

```
clients/<app>/lib/
├── core/           # networking (generated SDK), auth session, error handling, config
├── design_system/  # imported shared components + tokens (docs 17/18)
├── features/<feature>/   # screens, widgets, state, per feature (feature-first)
└── main.dart
```

**Why feature-first for the client:** it colocates everything a feature needs, scales as products grow,
and mirrors the backend's module boundaries, so a "medication administration" feature maps cleanly from
Flutter screen → API contract → backend module.

## 5. Conventions

- **Naming:** directories and files follow one convention per language (enforced by lint, doc 14);
  names describe domain concepts, not layers-as-nouns-only.
- **Ownership:** `CODEOWNERS` maps every path to owners; `platform/security`, `platform/identity`,
  `platform/authorization`, `platform/tenancy`, and `platform/audit` require security review (doc 14).
- **Boundaries enforced in CI:** import-linting forbids product→product and inward→outward-layer
  dependencies; violations fail the build (doc 13).
- **Generated code is generated, not hand-edited** (SDKs from OpenAPI, doc 08), and is clearly marked.

## 6. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Monorepo CI can get slow** and tooling-heavy as it grows. *Mitigation:* build/test-impact analysis,
  caching, and a proper monorepo build tool (e.g. Nx/Turborepo/Bazel-class) adopted when scale needs it.
- **Coupling temptation** — a shared repo makes it *easy* to reach across boundaries. *Mitigation:* CI-
  enforced import boundaries and ports-only cross-module contracts; the discipline is automated, not
  trusted.
- **Access control granularity** — everyone can see everything in one repo. *Mitigation:* CODEOWNERS for
  approvals; if a product ever needs stricter isolation (e.g. a partner-built product), it can be split
  out — the ports keep that split cheap.
- **Mixed-language monorepo** (Dart + TypeScript + HCL) needs multi-toolchain CI. *Mitigation:* per-
  language pipelines within the shared CI, standard containers.

**Tradeoffs accepted**
- Monorepo tooling investment and CI complexity in exchange for atomic cross-cutting changes and a
  single source of truth for the security-critical shared core. Given that the platform's guarantees
  live in shared code, keeping that code and its consumers in lockstep is worth the tooling cost.
- A rigid uniform internal structure limits per-module creativity — accepted, because navigability and
  consistency across a decades-long changing team outweigh local flexibility (doc 14).

**Better alternatives if constraints differed**
- **Polyrepo + a published, versioned platform SDK** is the right model once products become truly
  independent, separately-staffed, or externally-developed. We keep boundaries clean (ports, generated
  SDKs) specifically so this split is *possible* later without a rewrite — we just don't pay its
  coordination cost now.
- A **Bazel-style hermetic build** would maximize monorepo scalability and reproducibility; deferred as
  heavy for the current size, adopted if/when CI scale demands it.

---

*Prev: [15 — Compliance Readiness](15-compliance.md) · Next: [17 — Shared Component Library](17-shared-component-library.md)*
