# PRD — Kids Companion App (working title: TBD)

**A kids' version of the "Loaves, Lamps, and Ledgers" reader — with animation and games.**

- **Author / Owner:** Shandy Lindley
- **Date:** 2026-07-22
- **Status:** Draft v1 (research + roadmap)
- **Parent product:** *Loaves, Lamps, and Ledgers* (the book) + its free Flutter reader app ("Kindling")

> **Plain-English note (read me first):** This document is written so a non-developer can follow it.
> I use a **restaurant analogy** the whole way through: we start as a **food stand** (something real and
> working *today*), grow into a **restaurant with one employee**, then a **full front-of-house + back-of-house**
> operation. Each phase is a bigger, better version of the same idea — we never throw away what works.

---

## 1. What we are building (in kid terms)

You wrote a book that teaches grown-ups **money wisdom from the Bible** — three big ideas:

| Symbol | Grown-up idea | Kid idea |
|---|---|---|
| 🍞 **Loaves** | Work provides; diligence over "miracle months" | "We work, and work is good." |
| 🪔 **Lamps** | A budget is a lamp; track what you spend | "Light shows us where our money goes." |
| 📒 **Ledgers** | Write it down; be a faithful manager, not an owner | "We take care of what we're given." |

The **kids app** teaches those same three ideas to children (roughly ages **5–10**) using:

- **Animated characters** that talk and react
- **Simple, tappable mini-games** (one per big idea)
- **Read-aloud narration** so pre-readers can play too
- **Stickers / rewards** to celebrate progress
- **A calm "Parent Zone"** so parents/church/homeschool leaders trust it

**This is a companion, not a clone.** The grown-up reader stays as-is. The kids app is a new, separate,
brightly-colored experience with its **own new name** (to be chosen).

---

## 2. Who it's for

- **Primary user:** kids ~5–10 (playing, mostly non-readers to early readers)
- **Buyer / gatekeeper:** parents, grandparents, Sunday-school teachers, homeschool families
- **Distribution later:** churches and homeschool networks (your natural audience)

**Design rules for this audience:** big buttons, no tiny text, no ads, no data collection on kids,
read-aloud everything, and every screen should feel safe and gentle (matches the book's "not shame, but steady" tone).

---

## 3. The name (TBD — decide later, not today)

We need a **brand-new name**, separate from the book. Here's a shortlist to react to when you're ready —
no decision needed now:

| Idea | Why it could work |
|---|---|
| **Little Lamps** | Warm, gentle, ties to the "lamp/light" theme; easy for kids to say |
| **Coin Quest** | Game-y and exciting; signals "adventure with money" |
| **The Three Jars** | A real kids' money method (Give / Save / Spend) — instantly explains itself |
| **Bright Coins** | Cheerful, ownable, app-store friendly |
| **Kindling Kids** | Ties to the grown-up "Kindling" reader — a little spark that grows |
| **Loaf & Lamp** | Storybook feel; keeps two of the three book symbols |

*We can also test names with a few parents before committing. Names are cheap to change now, expensive later.*

---

## 4. Core features (full vision, trimmed down for early phases)

1. **Home / "World" screen** — a friendly animated map with three places to visit: the Bakery (Loaves),
   the Lighthouse/Lamp (Lamps), the Treasure Chest (Ledgers).
2. **Animated guide character** — a mascot (e.g., a little lamp or a baker mouse) that talks, cheers, and explains.
3. **Read-aloud everywhere** — tap any text and it's spoken.
4. **Three mini-games**, one per theme:
   - 🍞 *Bread Line* — help the baker do "one more loaf" (teaches diligence/work).
   - 🪔 *Light the Path* — shine the lamp to reveal where coins went (teaches tracking/budgeting).
   - 📒 *The Three Jars* — sort coins into **Give / Save / Spend** jars (teaches stewardship). **← our first game.**
5. **Sticker book / rewards** — earn a sticker for finishing a story or game.
6. **Parent Zone** (PIN-gated) — a short note to parents on the lesson, plus settings (sound, read-aloud speed).
7. **Progress saving** — remember where the child left off and which stickers they earned.

*(Later: multiple child profiles, cross-device sync, new "content packs," printable coloring pages, weekly challenges.)*

---

## 5. Research — what we can reuse instead of build

The whole point of this section: **buy/borrow before we build.** Here's what I found.

### 5a. Your existing app (biggest reuse win) ✅

The current Flutter reader already gives us, for free:
- **`ContentService`** — loads story/lesson content from simple JSON files in `assets/content/`.
- **`StorageService`** — saves progress, bookmarks, and settings locally (via `shared_preferences`).
- **`ShellScreen`** — a bottom-nav shell we can add a "Kids" tab to.
- **Cross-platform builds** already configured: Android, iOS, web, Windows, macOS, Linux.

**Meaning:** we don't start from zero. We add a **Kids Mode** onto a working app.

### 5b. Animation & games (Flutter-native, so they drop right in)

| Tool | What it gives us | License / cost | Use it for |
|---|---|---|---|
| **[Flame engine](https://flame-engine.org/)** | A 2D game engine for Flutter (game loop, sprites, collisions, taps). Already used by ed-tech apps for kids' math games. | Open source (MIT) | Our mini-games |
| **[Rive](https://rive.app/)** | Interactive animated characters with "state machines" (react to taps/state). Duolingo uses it; 15x smaller files than alternatives. First-class Flutter runtime. | Free tier for creating; runtime is free/open | Our talking mascot |
| **[Lottie](https://pub.dev/packages/lottie)** | Plays pre-made animations (from After Effects / LottieFiles). Simpler than Rive, huge free library. | Open source; many free animations | Confetti, stickers, simple loops |
| **[flutter_tts](https://pub.dev/packages/flutter_tts)** | Read-aloud using the device's built-in voice. No server, no cost, works offline. | Open source (MIT) | Narration for pre-readers |
| **[audioplayers](https://pub.dev/packages/audioplayers)** | Sound effects & music | Open source | Coin "cling," cheers |
| **[Flutter Casual Games Toolkit](https://flutter.dev/games)** | Google's free starter kit + examples for kids' games | Free | Reference patterns |

**Recommendation:** **Flame** for games + **flutter_tts** for read-aloud in the first phases (simplest, free, offline).
Add **Rive** for a polished talking mascot in Phase 1. Use **Lottie** for quick celebration effects.

### 5c. Backend & hosting (your preferred stack, used *when we need it*)

Your preferred stack is **Postgres + Railway + Cloudflare R2**. That's a great choice — **for the phase when
we add accounts and sync.** Early phases don't need a server at all (the app runs on the device), which is
exactly why we can ship a **quick win today**.

| Piece | Your preference | My take |
|---|---|---|
| **Hosting** | [Railway](https://railway.com/) | ✅ Great for the backend later. Note: **no permanent free tier** — Hobby plan is ~$5/mo credit, pay-as-you-go. Fine for us. |
| **Database** | Postgres (on Railway) | ✅ Solid. We add it in Phase 2 for parent accounts + progress sync. |
| **File storage** | Cloudflare R2 | ✅ Great for storing animation/audio/sticker assets and any future user uploads. No egress fees. |
| **Backend framework (optional)** | — | For a Dart-first team, **[Serverpod](https://serverpod.dev/)** pairs Flutter + Postgres cleanly. Alternatively **[Supabase](https://supabase.com/)** (Postgres + auth + storage, generous free tier) can *replace* a custom backend and shorten Phase 2. We'll decide when we get there. |

**Honest recommendation:** keep Phases 0–1 **100% offline** (no backend, no cost, ships today). Introduce
**Railway + Postgres** in Phase 2, and **R2** when we have real assets/uploads to store. Stay flexible: if
Phase 2 feels heavy, **Supabase** is a faster on-ramp that still uses Postgres under the hood.

### 5d. The four frameworks you asked us to use (these guide *how we build*, not what ships)

These are **AI-agent / workflow frameworks** — they make *me* (and future agents) build more carefully. They
are the "kitchen operating procedures," not ingredients in the app.

| Framework | What it is | How we'll use it |
|---|---|---|
| **[superpowers](https://github.com/obra/superpowers)** (obra) | A skills framework for coding agents: brainstorm → spec → plan → test-driven build → review. | Our default **build discipline** — brainstorm a feature, write a tiny spec, build with tests. |
| **[get-shit-done / GSD](https://github.com/gsd-build/get-shit-done)** | Lightweight spec-driven development + context engineering for Claude Code. *(Note: original repo archived June 2026; active work moved to [gsd-core](https://github.com/open-gsd/gsd-core).)* | **Turning each PRD phase into a crisp spec** before coding. |
| **[metaswarm](https://github.com/dsifry/metaswarm)** (dsifry) | Multi-agent orchestration: 18 specialist agents, quality gates, mandatory tests, independent review. | **Heavier phases** (backend, security) where we want review gates. |
| **[claude-agents-library](https://github.com/aiagentskit/claude-agents-library)** | 34 ready-made agent "personas" (Frontend Dev, Mobile App Builder, UX Researcher, Whimsy Injector, API Tester, etc.). | **Pull in specific personas** — e.g., "Whimsy Injector" for kid delight, "Mobile App Builder" for Flutter, "API Tester" for Phase 2. |

**Plain English:** these don't change what the app *is*. They change how *carefully and quickly* we build it —
like giving a kitchen a checklist, a head chef, and a review line before food goes out.

---

## 6. Recommended technical approach

- **Keep building on the existing Flutter app.** Add a **Kids Mode** (new screens + a "Kids" entry), reusing
  `ContentService` and `StorageService`.
- **Kid content lives in a new JSON file** (e.g., `assets/content/kids.json`) — same pattern as `book.json`.
  You (or I) can edit the kid-friendly retellings without touching code.
- **Offline-first for the quick win.** No server on day one.
- **Games with Flame, narration with flutter_tts, celebrations with Lottie, mascot with Rive (Phase 1).**
- **Backend later:** Railway + Postgres for accounts/sync, Cloudflare R2 for assets. Serverpod or Supabase TBD.

---

## 7. Roadmap — the restaurant, phase by phase

### 🥪 Phase 0 — The Food Stand (TODAY — the quick win)

**Goal:** something real, playable, and cute *today*, running in the browser and on a phone. Offline. No cost.

- New **"Kids" section** added to the app shell.
- A bright **Kids Home** with the mascot greeting the child (animated with Lottie/simple Flutter animation).
- **One playable mini-game: "The Three Jars"** — coins appear; the child taps/drags each coin into
  **Give / Save / Spend**; the jar fills; cheerful sound + confetti; earns a **sticker**.
- **Read-aloud** intro line using flutter_tts.
- **Progress saved locally** (sticker earned, game completed) via the existing `StorageService`.
- **Smoke + functional tests** (see Testing).

**Why this game first:** "Give / Save / Spend" is a proven real-world kids' money method and maps *perfectly*
to your stewardship message — it's the whole book in one toy.

*Deliverable: a working Flutter web build you can open and tap through today.*

### 👤 Phase 1 — Restaurant with One Employee

**Goal:** it feels like a real little product.

- **All three mini-games** (Bread Line, Light the Path, Three Jars).
- **Rive talking mascot** with reactions (cheer, encourage, "try again").
- **Sticker book screen** to see everything earned.
- **Sound effects + gentle music** (audioplayers).
- **Parent Zone** (PIN-gated) with a one-line lesson per game.
- **Kid content authored** from 3–4 of your chapters, retold at a kid level.
- **Widget/functional tests** for each game.

### 🍽️ Phase 2 — Full Front-of-House + Back-of-House

**Goal:** accounts, sync, and content you control without shipping a new app.

- **Backend on Railway + Postgres** (or Supabase) — parent accounts, multiple child profiles.
- **Cloud progress sync** across devices.
- **Cloudflare R2** for animation/audio/sticker assets and future uploads.
- **Content served from the backend** so you can add stories without an app update.
- **Integration tests against real APIs** + **QA gate** + **Security gate** (kids' data = extra care).

### 🚀 Phase 3 — Growth

- New **content packs** (seasons, holidays, new chapters).
- **Weekly challenges**, printable coloring/reward pages, optional nicer TTS voices.
- **Light analytics** (privacy-safe) to see which lessons land.
- Possible **app-store release** (Android/iOS) once polished.

---

## 8. Testing plan (your hierarchy, applied)

We test from **light to heavy**. Flutter also gives us `flutter test` (widget tests) and `integration_test`;
we use **Playwright** against the **Flutter *web* build**, and **Pytest** for any Python backend later.

| Level | Name | Tool | When |
|---|---|---|---|
| 0 | Full UI/UX testing | **Playwright CRX** (Chrome extension) + **Pytest** | Ongoing, from Phase 0 |
| 1 | **Smoke** — page loads? JS errors? key elements visible? | Playwright + `flutter build web` | Every phase |
| 2 | **Functional** (mocked) | Playwright (mocked) + `flutter test` | Every game/feature |
| 3 | **Integration** (real APIs) | Playwright + real backend | Phase 2+ |
| 4 | **QA gate** — code quality, error handling, DB, performance checklist | Review checklist | Before each release |
| 5 | **Security gate** — input validation, auth, data protection (esp. kids' data) | Security checklist | Phase 2+ (mandatory before any accounts) |

**Phase 0 testing target:** Level 1 (smoke) + Level 2 (the Three Jars game plays correctly, sticker is awarded,
progress persists).

---

## 9. Risks & how we handle them

| Risk | Mitigation |
|---|---|
| Trying to do too much day one | Ship **one** game (Three Jars) first. Everything else is later phases. |
| Railway has no free tier | Fine — no backend until Phase 2; ~$5/mo when we need it. Supabase free tier is a fallback. |
| Kids' data privacy | No accounts or data collection until Phase 2, and only behind the Security gate. |
| Naming delay | Name is TBD and **doesn't block** any building. We ship under a placeholder. |
| Rive/animation polish takes time | Phase 0 uses simple Flutter/Lottie animation; Rive mascot is a Phase 1 upgrade. |

---

## 10. What I need from you (nothing blocks the quick win)

1. **Go / no-go on Phase 0** — do you want me to build the **Three Jars** mini-game today? *(Recommended: yes.)*
2. **Later, not now:** pick a name from Section 3 (or tell me a vibe and I'll generate more).
3. **Later:** confirm the **Give / Save / Spend** jar labels match your teaching (some faith curricula use
   "Give / Save / Spend" or "Tithe / Save / Spend" — your call).
4. **When we reach Phase 2:** I'll walk you through creating a **Railway** account step-by-step.

---

## 11. Glossary (plain English)

- **Flutter** — a toolkit to build one app that runs on phones, web, and computers.
- **Flame** — a game engine (handles the "game loop," taps, moving pictures) for Flutter.
- **Rive / Lottie** — tools for animated cartoon characters and effects.
- **TTS (text-to-speech)** — the app reads words out loud.
- **Backend** — the "kitchen in the back": a server + database the app talks to.
- **Postgres** — a popular, reliable database (a smart filing cabinet).
- **Railway** — a service that runs our backend on the internet.
- **Cloudflare R2** — cloud storage for files (pictures, sounds).
- **Smoke test** — "does it even turn on?" The quickest check.
