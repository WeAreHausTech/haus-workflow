# Catalog Skills & Agents Cleanup — 2026-06-18

Repos: `haus-workflow` · `haus-workflow-catalog`
Status: **In progress** — P0 ✅ P1 ✅ P2a ✅ (2026-06-22); P2b+ open
Context: Full catalog review of 82 skills + 16 agents; duplicate/overlap analysis and baseline token reduction.

### Content preference policy

**Prefer third-party / curated skills over haus-owned stack patterns when both cover the same stack**, because haus-owned `*-patterns` skills are intentionally minimal routers (~140 lines + thin `references/` files) while curated upstream skills are typically 2–7× larger with production-grade examples and maintainer-authored guidance.

**Keep haus-owned when:**

- No curated equivalent exists in catalog **or** ECC upstream (Vendure, Qliro, BullMQ, Expo, React Router v7, etc.)
- Haus skill covers org-specific or niche scope the curated item does not (e.g. `writing-documentation`, config setup skills)
- Curated item is a router stub or narrower than haus (e.g. `sentry-sentry-workflow` is a 49-line router — pair with other Sentry skills, do not resurrect haus `sentry-patterns`)

---

## Background

| Metric                          |                Current |
| ------------------------------- | ---------------------: |
| Catalog items (skills + agents) |                     96 |
| Always-installed baseline       | 22 items (~51k tokens) |
| Deprecated skills in manifest   |                      0 |

### Install model (today)

1. **Baseline** (`default: true`) → always recommended and installed.
2. **Stack-gated** → `requiresAny` satisfied + tag/role/dependency evidence.
3. **`reviewStatus: deprecated`** → skipped by `recommend` and `writeClaudeFiles`; **not** re-installed. _(P1: all 8 deprecated entries deleted from manifest.)_
4. **Stale cleanup** → `cleanupStaleCatalogItems` prunes IDs **removed from manifest** or **`reviewStatus: deprecated`** (hash-gated; user edits preserved). _(P0 shipped.)_

### Deprecated items on update — gap _(fixed P0 + P1)_

~~**Deprecated skills/agents are not removed on `haus apply` / `haus update`.**~~

| Step                       | Behavior                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `recommend`                | Skips `reviewStatus: deprecated`                                                     |
| `writeClaudeFiles`         | Won't install deprecated                                                             |
| `cleanupStaleCatalogItems` | Prunes when ID is **gone** from manifest **or** manifest item is **deprecated** (P0) |

P1 deleted all 8 deprecated manifest entries (catalog `v2.9.1`); removed IDs are pruned on apply/update when lock hash matches.

---

## Phased execution order

Merge each PR to `main` before starting the next branch — no stacking. Run `yarn verify` (CLI) and `yarn validate` + `yarn test` (catalog) when touching each repo.

| Phase   | Repo                                          | Scope                                                    | Status                        |
| ------- | --------------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| **P0**  | `haus-workflow`                               | Prune deprecated items on apply/update                   | ✅ #126                       |
| **P1**  | `haus-workflow-catalog`                       | Delete 8 deprecated manifest entries + skill dirs        | ✅ `v2.9.1`, fixture #127     |
| **P2**  | `haus-workflow-catalog`                       | Remove redundant haus-owned skills (keep curated)        | P2a ✅ `v2.9.2`, fixture #129 |
| **P2f** | `haus-workflow-catalog`                       | Sync more upstream; drop remaining thin haus routers     |                               |
| **P2g** | `haus-workflow-catalog` (+ recommender)       | Co-install bloat: tier clusters, gate audit **(P2g-10)** |                               |
| **P3**  | `haus-workflow-catalog` (+ recommender tests) | Tier baseline superpowers + agents                       |                               |
| **P4**  | `haus-workflow-catalog`                       | Agent dedup                                              |                               |
| **P5**  | Both                                          | Docs, release notes, fixture sync                        |                               |

### Target outcomes

| Metric                                 | Before |          Target |
| -------------------------------------- | -----: | --------------: |
| Catalog skills                         |     82 |             ~64 |
| Baseline token load                    |   ~51k |         ~12–15k |
| Next.js stack-specific add (on top)    |   ~30k |         ~12–16k |
| Vendure / Redis-heavy stack add        |   ~17k |          ~8–10k |
| Deprecated on disk after `haus update` |    Yes | No ✅ (P0 + P1) |

---

## Execution checklist

### P0 — CLI: prune deprecated on apply/update (`haus-workflow`) ✅

- [x] **P0-1** — Extend `cleanupStaleCatalogItems` in `src/claude/write-claude-files.ts` to prune lock entries when manifest item has `reviewStatus: deprecated` (same hash gate + user-edit preservation as manifest removal)
- [x] **P0-2** — Pass `manifestById` (or equivalent) into cleanup; keep deselected-but-still-approved catalog items untouched
- [x] **P0-3** — Add test: previously installed deprecated skill deleted on re-apply (unmodified copy)
- [x] **P0-4** — Add test: user-edited deprecated copy preserved with warning
- [x] **P0-5** — Add test: deselected item still in manifest and approved → not pruned (regression)
- [x] **P0-6** — Update `docs/cli.md` stale-cleanup section (deprecated + removed upstream)
- [x] **P0-7** — Update `README.md` stale-cleanup blurb
- [x] **P0-8** — `yarn verify`

Merged: [haus-workflow#126](https://github.com/WeAreHausTech/haus-workflow/pull/126)

### P1 — Delete 8 deprecated catalog entries (`haus-workflow-catalog`) ✅

Depends on P0 merged (or document that projects keep stale files until CLI upgrade).

| Remove                         | Replace with                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `haus.sentry-patterns`         | `haus.sentry-sentry-workflow` + `haus.sentry-sentry-php-sdk`                            |
| `haus.stripe-patterns`         | `haus.stripe-stripe-best-practices`                                                     |
| `haus.supabase-patterns`       | `haus.supabase-supabase`                                                                |
| `haus.sanity-patterns`         | `haus.sanity-content-modeling-best-practices`                                           |
| `haus.laravel-patterns`        | `haus.ecc-laravel-patterns`                                                             |
| `haus.nestjs-graphql-patterns` | `haus.ecc-nestjs-patterns` + `haus.apollo-apollo-server` + `haus.apollo-graphql-schema` |
| `haus.tailwind-scss-patterns`  | `haus.wshobson-tailwind-design-system`                                                  |
| `haus.database-patterns`       | `haus.wshobson-postgresql-table-design` + redis skills                                  |

- [x] **P1-1** — Delete skill dirs under `skills/haus-owned/stack-patterns/` for all 8 items
- [x] **P1-2** — Remove manifest entries; version bump via `yarn release` → **`v2.9.1`**
- [x] **P1-3** — `yarn validate` + `yarn test`
- [x] **P1-4** — Catalog release (`yarn release`)
- [x] **P1-5** — Bump CLI bundled catalog fixture (`haus-workflow`)
- [x] **P1-6** — `yarn verify` (CLI) — includes archetype test fix for removed IDs ([#127](https://github.com/WeAreHausTech/haus-workflow/pull/127))

Merged: catalog `main` @ `b9e41e4`; CLI fixture [haus-workflow#127](https://github.com/WeAreHausTech/haus-workflow/pull/127)

### P2 — Remove redundant haus-owned skills (`haus-workflow-catalog`)

**Direction:** drop minimal haus-owned routers where a richer curated skill already installs for the same stack. See [haus vs curated comparison](#haus-vs-curated-comparison-pass-2026-06-18) below.

#### P2a — Drop haus-owned; keep curated (confirmed after content pass) ✅

| Remove (haus-owned)          | Keep (curated)                         | Rationale                                                                                    |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `haus.nextjs-patterns`       | `haus.ecc-frontend-patterns`           | ECC ~658L vs haus ~190L total; covers Next.js App Router + React patterns with code examples |
| `haus.react19-patterns`      | `haus.ecc-frontend-patterns`           | Same ECC skill gates on `react` / `react19` / `nextjs`; haus react router is redundant       |
| `haus.vite8-patterns`        | `haus.ecc-vite-patterns`               | ECC ~451L vs haus ~190L; fuller Vite config/plugin guidance                                  |
| `haus.radix-shadcn-patterns` | `haus.wshobson-tailwind-design-system` | wshobson ~893L vs haus ~190L; design-system + Tailwind/shadcn depth                          |

- [x] **P2a-1** — Delete haus skill dirs + manifest entries for the four items above
- [x] **P2a-2** — Confirm recommender gates still fire correctly (ECC/wshobson `requiresAny` already cover these stacks)
- [x] **P2a-3** — Catalog release `v2.9.2` + CLI fixture sync ([#129](https://github.com/WeAreHausTech/haus-workflow/pull/129)); archetype golden updated

Merged: catalog release `v2.9.2`; CLI fixture [haus-workflow#129](https://github.com/WeAreHausTech/haus-workflow/pull/129)

#### P2b — Drop niche curated duplicates (token trim; not haus-vs-curated)

| Remove                        | Keep                                | Rationale                                                   |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `haus.stripe-upgrade-stripe`  | `haus.stripe-stripe-best-practices` | Upgrade/migration niche; official best-practices is primary |
| `haus.stripe-stripe-projects` | same                                | Project-scaffolding niche; overlaps best-practices scope    |

- [ ] **P2b-1** — Remove stripe upgrade + projects manifest entries and skill dirs
- [ ] **P2b-2** — Validate, release, fixture sync

#### P2c — Sync ECC upstream + drop haus-owned (second content pass)

ECC upstream (`affaan-m/ECC`) has skills **not yet in catalog** that supersede thin haus routers. Sync via `sources.yaml` + `node scripts/sync-upstream.mjs --apply`, then drop haus.

| Drop (haus-owned)                                       | Sync + keep (ECC)     | Rationale                                                                                                            |
| ------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `haus.prisma-patterns`                                  | `ecc/prisma-patterns` | ECC ~400L with traps, transactions, serverless; haus ~190L router                                                    |
| `haus.vue-patterns`                                     | `ecc/vue-patterns`    | ECC comprehensive Composition API + Pinia + Nuxt; haus ~190L router                                                  |
| `haus.dotnet-patterns` + `haus.dotnet-service-patterns` | `ecc/dotnet-patterns` | ECC ~300L idiomatic C# + DI + EF; haus pair are duplicate thin routers. **Keep** `ecc-csharp-testing` (testing lane) |
| `haus.playwright-patterns`                              | `ecc/e2e-testing`     | ECC ~350L POM, config, CI, flaky-test patterns; haus ~190L router                                                    |
| `haus.testing-library-patterns`                         | `ecc/react-testing`   | ECC covers RTL + Vitest/Jest + MSW + a11y; haus ~190L router. Gate on `react` / `@testing-library/*`                 |

- [ ] **P2c-1** — Add ECC items to `sources.yaml` (prisma-patterns, vue-patterns, dotnet-patterns, e2e-testing, react-testing)
- [ ] **P2c-2** — Run `sync-upstream.mjs --apply`; add manifest entries with `reviewStatus: approved`
- [ ] **P2c-3** — Delete corresponding haus-owned dirs + manifest entries
- [ ] **P2c-4** — Validate, release, fixture sync

#### P2d — Drop haus-owned internal duplicates (no new sync)

| Drop                      | Keep                                                                        | Rationale                                                                               |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `haus.wordpress-patterns` | `wordpress-bedrock-patterns` + `wordpress-acf-elementor-jetengine-patterns` | On Bedrock sites all three install; generic WP router overlaps bedrock + builder skills |

- [ ] **P2d-1** — Remove `haus.wordpress-patterns`; validate gates still cover `wordpress` / `roots/bedrock` stacks via remaining skills

#### P2e — Keep haus-owned (reviewed; no curated substitute or haus adds unique scope)

| Haus-owned                                                     | Why keep                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `haus.typescript5-patterns`                                    | No curated TS skill (only `ecc-typescript-reviewer` agent)                                              |
| `haus.expo-react-native-patterns`                              | Expo Router / EAS / managed-vs-bare — not in ECC                                                        |
| `haus.react-router-v7-patterns`                                | RR v7 framework mode — not in ECC                                                                       |
| `haus.nextauth-patterns`                                       | Auth.js v4/v5 + middleware edge split — not in ECC                                                      |
| `haus.auth-oidc-azure-bankid-patterns`                         | Haus enterprise auth (OIDC / Azure AD / BankID / SAML2)                                                 |
| `haus.tanstack-query-router-patterns`                          | TanStack Query/Router — ECC frontend only mentions `@tanstack/react-virtual`; **tighten gate (P2g-10)** |
| `haus.bullmq-patterns`                                         | BullMQ/IORedis — no ECC equivalent                                                                      |
| `haus.qliro-patterns`                                          | `@haus-tech/qliro-plugin` — Haus-specific                                                               |
| `haus.vendure-app-patterns` + `haus.vendure-plugin-patterns`   | Different roles; Haus Vendure conventions                                                               |
| `haus.strapi-patterns`                                         | No curated Strapi skill                                                                                 |
| `haus.laravel-nova-patterns`                                   | Nova-specific; no ECC equivalent                                                                        |
| `haus.nx21-monorepo-patterns` + `haus.turbo-monorepo-patterns` | Monorepo role gates — haus-only                                                                         |
| `haus.i18next-patterns`                                        | No curated i18next skill                                                                                |
| `haus.storybook-patterns`                                      | No curated Storybook skill                                                                              |
| `haus.package-manager-yarn4-pnpm89`                            | Yarn 4 / pnpm conventions — haus-only                                                                   |
| `haus.writing-documentation` + config setup skills             | Haus org docs / scaffold flow                                                                           |

**Curated pairs — keep both (distinct purpose):**

| Keep                                    | Pair                                                        | Why                                               |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `haus.ecc-laravel-patterns`             | `ecc-laravel-verification` + `ecc-laravel-plugin-discovery` | Patterns vs verification loop vs LaraPlugins MCP  |
| `haus.ecc-csharp-testing`               | `ecc/dotnet-patterns` (after P2c sync)                      | Testing vs general .NET patterns                  |
| `haus.wshobson-postgresql-table-design` | `ecc/postgres-patterns` _(not syncing)_                     | wshobson deeper; ECC postgres is cheat-sheet only |

### P2f — Sync upstream + drop more haus routers (`haus-workflow-catalog`)

Second upstream pass from configured sources. Sync via `sources.yaml` + `node scripts/sync-upstream.mjs --apply`, then drop haus.

#### P2f-a — Drop haus; sync replacement

| Drop (haus-owned)                             | Sync + keep                   | Source   | Rationale                                                                                           |
| --------------------------------------------- | ----------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `haus.phpunit-patterns`                       | `ecc/laravel-tdd`             | ECC      | PHPUnit/Pest/Laravel factories/HTTP tests (~500L vs ~190L router)                                   |
| `haus.vitest-patterns` + `haus.jest-patterns` | `javascript-testing-patterns` | wshobson | Vitest+Jest+mocking+integration; covers NestJS/backend. React stacks covered by P2c `react-testing` |

- [ ] **P2f-a-1** — Add `laravel-tdd`, `javascript-testing-patterns` to `sources.yaml`
- [ ] **P2f-a-2** — Sync upstream; manifest entries with `reviewStatus: approved`
- [ ] **P2f-a-3** — Delete `phpunit-patterns`, `vitest-patterns`, `jest-patterns` dirs + manifest entries
- [ ] **P2f-a-4** — Confirm NestJS fixture still gets JS testing via `javascript-testing-patterns` (not `react-testing`)
- [ ] **P2f-a-5** — Validate, release, fixture sync

#### P2f-b — Add upstream complements (keep haus; no drop)

| Add (sync)                         | Source   | Pairs with (haus or curated)              | Why complement not replace                          |
| ---------------------------------- | -------- | ----------------------------------------- | --------------------------------------------------- |
| `typescript-advanced-types`        | wshobson | `haus.typescript5-patterns`               | Advanced generics/types vs contract/migration scope |
| `redis-patterns`                   | ECC      | `haus.bullmq-patterns` + redis official×3 | General Redis; BullMQ stays queue-specific          |
| `sanity-best-practices`            | sanity   | `sanity-content-modeling-best-practices`  | Studio/GROQ depth beyond modeling skill             |
| `supabase-postgres-best-practices` | supabase | `haus.supabase-supabase`                  | Postgres/RLS patterns beyond main Supabase skill    |

- [ ] **P2f-b-1** — Add complement items to `sources.yaml`; sync + manifest
- [ ] **P2f-b-2** — Gate complements on same `requiresAny` as paired skill (avoid double-install on unrelated stacks)
- [ ] **P2f-b-3** — Validate, release, fixture sync

#### P2f-c — Evaluate stack-specific Sentry + Apollo (defer decision to implementation)

| Current                                                                               | Option A                                                                                                        | Option B (status quo)        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `sentry-sentry-workflow` (633 tok router) + `sentry-sentry-php-sdk` (3588) on Laravel | Sync `sentry-nextjs-sdk`, `sentry-node-sdk`, `sentry-nestjs-sdk`; drop generic workflow when stack SDK installs | Keep workflow + php-sdk pair |
| `apollo-server` + `graphql-schema` on Vendure/NestJS                                  | Sync `apollo-federation`, `graphql-operations`, `apollo-client`                                                 | Keep server+schema only      |

- [ ] **P2f-c-1** — Spike: compare line counts + overlap per stack fixture
- [ ] **P2f-c-2** — If workflow is redundant with stack SDK → drop `sentry-sentry-workflow` (P2g-3)
- [ ] **P2f-c-3** — If federation/operations add value on Vendure → sync; gate behind `graphql` + `@apollo/*`

### P2g — Co-install bloat pass (`haus-workflow-catalog` + recommender)

**Problem:** Even after P2a–P2f, many stacks still load 3+ skills/agents for the same concern. This phase targets **installed token load**, not just catalog count.

Token estimates from `manifest.json#tokenEstimate` and fixture archetypes.

#### P2g-1 — Superpowers near-duplicates (extends P3 tier list)

| Cluster          | Items (all `default: true` today)                                                               | Tokens | Action                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------- |
| Meta writing     | `writing-skills` + `writing-plans`                                                              | ~11.2k | **Tier:** keep `writing-plans` in baseline; gate `writing-skills` opt-in  |
| Parallel agents  | `subagent-driven-development` + `dispatching-parallel-agents`                                   |  ~5.8k | **Tier:** keep `dispatching-parallel-agents`; gate subagent-driven opt-in |
| Gate workflow    | `specifying-gates` + `checking-gates`                                                           |  ~2.9k | **Tier:** keep `checking-gates` only (specifying is meta-redundant)       |
| Code review pair | `receiving-code-review` + `requesting-code-review`                                              |  ~2.3k | **Tier:** both opt-in (not every task needs review workflow)              |
| Branch workflow  | `using-git-worktrees` + `finishing-a-development-branch` + `executing-plans`                    |  ~5.3k | **Tier:** keep `executing-plans`; gate worktrees + finishing opt-in       |
| TDD overlap      | `superpowers-test-driven-development` + P2c `react-testing` / P2f `javascript-testing-patterns` | ~2.5k+ | **Tier:** TDD superpower opt-in when stack testing skill installs         |

- [ ] **P2g-1** — Fold into P3 manifest `default: false` list (document full 6-core vs 4-extended baseline)
- [ ] **P2g-1** — Target baseline after P3+P2g-1: **~12–15k tokens** (down from ~51k)

#### P2g-2 — Redis skill cluster (Vendure / BullMQ stacks)

All three redis official skills share `requiresAny: [{stack: redis}, {dependency: redis}]` → **~6.9k tokens together** on Vendure.

| Keep default on redis stack       | Gate opt-in                                                         |
| --------------------------------- | ------------------------------------------------------------------- |
| `redis-redis-connections` (~3.5k) | `redis-redis-security` (~1.9k), `redis-redis-observability` (~1.5k) |

- [ ] **P2g-2** — Remove tag-only auto-install path for security/observability; require `role:redis-ops` or explicit `--select`
- [ ] **P2g-2** — Document in manifest `whenNotToUse` cross-refs

**Est savings on Vendure:** ~3.4k tokens

#### P2g-3 — Sentry double-install (Laravel / PHP)

Laravel fixture installs `sentry-sentry-php-sdk` (3588) + `sentry-sentry-workflow` (633 router).

- [ ] **P2g-3** — If P2f-c confirms workflow adds no value beyond php-sdk → **drop `sentry-sentry-workflow`** from catalog
- [ ] **P2g-3** — Else: add recommender rule — skip workflow when any stack-specific Sentry SDK skill is selected

**Est savings on Laravel:** ~0.6–3.6k tokens

#### P2g-4 — Laravel skill cluster

| Item                           | Tokens | Issue                                                       |
| ------------------------------ | -----: | ----------------------------------------------------------- |
| `ecc-laravel-patterns`         |   2638 | Keep — primary                                              |
| `ecc-laravel-verification`     |   1066 | Keep — distinct verification loop                           |
| `ecc-laravel-plugin-discovery` |   1599 | LaraPlugins MCP niche; overlaps patterns discovery sections |

- [ ] **P2g-4** — Gate `ecc-laravel-plugin-discovery` behind `role:laravel-plugins` or opt-in only
- [ ] **P2g-4** — After P2f-a, confirm `laravel-tdd` does not overlap `laravel-verification` (patterns vs loop — keep both if distinct)

**Est savings on Laravel:** ~1.6k tokens

#### P2g-5 — Testing skill + agent pile (React / Playwright stacks)

Next.js fixture (`@playwright/test` in deps) can load:

| Layer    | Item                                          |      Tokens |
| -------- | --------------------------------------------- | ----------: |
| Baseline | `superpowers-test-driven-development`         |        2467 |
| Skill    | `playwright-patterns` → P2c `ecc/e2e-testing` | ~190 → ~350 |
| Skill    | P2c `ecc/react-testing`                       |        ~400 |
| Agent    | `ecc-e2e-runner`                              |        1274 |

- [ ] **P2g-5** — After P2c: drop `playwright-patterns` (in P2c); ensure only `e2e-testing` remains
- [ ] **P2g-5** — Gate `ecc-e2e-runner` opt-in when `e2e-testing` skill already installed (skill covers patterns; agent for active test authoring only)
- [ ] **P2g-5** — Remove `oh-my-claudecode-test-engineer` from baseline (already P3) — overlaps e2e-runner

**Est savings on Next.js:** ~2.5–4k tokens

#### P2g-6 — React reviewer agent overlap

| Item                       | Tokens | Overlap                                           |
| -------------------------- | -----: | ------------------------------------------------- |
| `ecc-react-reviewer`       |   2856 | Hooks, RSC boundaries, a11y basics                |
| `ecc-typescript-reviewer`  |   2270 | TS types, strictness                              |
| `ecc-react-build-resolver` |   2801 | Build failures only — keep gated on build signals |
| `ecc-build-error-resolver` |   1191 | **Drop** (P4) — subset of react-build-resolver    |

- [ ] **P2g-6** — Gate `ecc-typescript-reviewer`: install on `typescript` stack **without** `react` / `nextjs` tag match, OR when `.ts` files dominate (scanner signal TBD)
- [ ] **P2g-6** — On pure React/Next repos: react-reviewer only (~2.3k saved)

#### P2g-7 — Database skill + agent overlap (Prisma / Postgres stacks)

| Item                               | Tokens | Overlap                   |
| ---------------------------------- | -----: | ------------------------- |
| `wshobson-postgresql-table-design` |   4021 | Schema design depth       |
| `ecc-database-reviewer`            |   1336 | Query review + migrations |
| P2c `ecc/prisma-patterns`          |   ~400 | ORM patterns              |

- [ ] **P2g-7** — Keep all three — distinct lanes (design vs review vs ORM). **No drop** unless user reports noise
- [ ] **P2g-7** — Optional: gate `database-reviewer` behind `role:database` to trim default Prisma installs (~1.3k)

#### P2g-8 — Docker skill source swap

| Current                                                   | Alternative                         |
| --------------------------------------------------------- | ----------------------------------- |
| `sickn33-docker-expert` (3610 tok, sickn33 grab-bag repo) | `ecc/docker-patterns` (ECC curated) |

- [ ] **P2g-8** — Sync `ecc/docker-patterns`; compare token count + quality
- [ ] **P2g-8** — If ECC ≥ quality: drop sickn33 docker-expert; remove sickn33 from `sources.yaml` if no other items

#### P2g-9 — Stripe mega-skill (no drop; confirm gating)

`stripe-stripe-best-practices` (~7.5k) is largest single skill. Already stack-gated — **keep**, but verify it never lands on baseline or tag-only match without `stripe` dependency.

- [ ] **P2g-9** — Audit recommender: stripe skill only when `stripe` stack or `stripe`/`@stripe/*` dep evidence

#### P2g-10 — `requiresAny` / tag gate audit (false-positive installs)

**Problem:** Several skills use OR-gates where one branch is too broad (`packageNamePattern: "@scope/*"`) or a **stack clause unrelated to the skill** (`stack: laravel` on Sentry PHP SDK). Any matching branch satisfies `requiresAny`; item then installs if tag/dep evidence exists.

**Audit method:** Walk every non-deprecated skill/agent `requiresAny` in `manifest.json`; flag catch-all `packageNamePattern`, redundant patterns, and stack clauses that install without the relevant dependency.

##### Gate fixes — implement in `manifest.json`

| Priority | Item                                  | Issue                                                                                                                   | Fix                                                                                                                                                     | Est savings                  |
| -------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **P0**   | `haus.tanstack-query-router-patterns` | `packageNamePattern: "@tanstack/*"` installs on `@tanstack/react-virtual`-only projects (ECC frontend uses virtualizer) | Remove `@tanstack/*` clause; keep only `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/query-core` deps. Remove misleading `react19` tag. | ~2.2k on virtual-only stacks |
| **P0**   | `haus.sentry-sentry-php-sdk`          | `stack: laravel` OR-branch installs **3.6k Sentry PHP skill on every Laravel app** without `sentry/sentry`              | Remove `stack: laravel` clause; require `dependency: sentry/sentry` and/or `packageNamePattern: "@sentry/*"` (PHP SDK packages only if needed).         | ~3.6k on Laravel w/o Sentry  |
| **P1**   | `haus.nx21-monorepo-patterns`         | `packageNamePattern: "@nx/*"` matches stray `@nx/eslint-plugin` without monorepo role                                   | Remove `@nx/*` pattern; keep `role: nx-monorepo` + `dependency: nx`.                                                                                    | ~2.2k on mis-tagged repos    |
| **P1**   | `haus.sentry-sentry-workflow`         | `packageNamePattern: "@sentry/*"` + `stack: sentry` — workflow on any Sentry package                                    | Require `stack: sentry` only, or drop workflow entirely (P2g-3). Remove `@sentry/*` catch-all.                                                          | ~0.6k                        |
| **P2**   | `haus.storybook-patterns`             | `@storybook/*` redundant with explicit `storybook` + `@storybook/react` deps                                            | Remove `packageNamePattern: "@storybook/*"`.                                                                                                            | Hygiene                      |
| **P2**   | `haus.expo-react-native-patterns`     | `react` tag unused for install (requiresAny gates expo) — audit noise                                                   | Remove `react` from tags (keep `expo`, `react-native`, `mobile`).                                                                                       | None (clarity)               |

##### Resolved by earlier phases (no separate gate work)

| Item                            | Issue                                       | Resolution                      |
| ------------------------------- | ------------------------------------------- | ------------------------------- |
| `haus.radix-shadcn-patterns`    | `@radix-ui/*` catch-all                     | **P2a** deletes skill           |
| `haus.testing-library-patterns` | `@testing-library/*` catch-all              | **P2c** deletes skill           |
| `haus.react19-patterns`         | `dependency: react` co-installs with nextjs | **P2a** deletes skill           |
| `haus.supabase-patterns` ⚠️     | had `@supabase/*`                           | **P1** deletes deprecated entry |
| `haus.vendure-plugin-patterns`  | `@haus/vendure-*`                           | Org-scoped — **keep**           |

##### Intentional broad gates (no change)

| Item                         | Gate                                        | Why OK                                           |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `haus.typescript5-patterns`  | `dependency: typescript`                    | Every TS repo should get contract patterns       |
| `haus.ecc-frontend-patterns` | `dependency: react`                         | Primary React/Next guidance — large but intended |
| `haus.ecc-php-reviewer`      | `stack: php`                                | All PHP repos (Laravel, WordPress, etc.)         |
| `haus.supabase-supabase`     | `stack: supabase` + `@supabase/supabase-js` | No catch-all pattern                             |

##### Checklist

- [ ] **P2g-10-1** — Apply manifest `requiresAny` / tag fixes for P0 + P1 rows
- [ ] **P2g-10-2** — Apply P2 hygiene rows (storybook, expo tags)
- [ ] **P2g-10-3** — Add recommender regression fixtures:
  - Next.js + `@tanstack/react-virtual` only → **must not** recommend `tanstack-query-router-patterns`
  - Laravel without Sentry → **must not** recommend `sentry-sentry-php-sdk`
  - Nx fixture with only `@nx/eslint-plugin` (no `nx` dep / role) → **must not** recommend `nx21-monorepo-patterns`
- [ ] **P2g-10-4** — Update `recommend-archetypes-golden.json`: remove `sentry-sentry-php-sdk` from `laravel-app.mustInclude` (or add `sentry/sentry` to laravel fixture if Sentry install is still desired in that archetype)
- [ ] **P2g-10-5** — `yarn validate` + `yarn test` (catalog); golden archetype tests + `yarn verify` (CLI)
- [ ] **P2g-10-6** — Document gate-audit convention in catalog `docs/` or validation-rules ADR: **no catch-all `packageNamePattern` unless scope is intentionally broad; stack OR-branches must match skill purpose**

#### P2g summary — estimated per-stack savings (cumulative with P0–P2f)

| Profile           | Current install tokens (approx) | After P2g (approx) | Main trims                          |
| ----------------- | ------------------------------: | -----------------: | ----------------------------------- |
| Unknown / minimal |                            ~51k |            ~12–15k | P3 + P2g-1 superpowers              |
| Next.js           |                            ~80k |            ~35–42k | P2a + P2c + P2f + P2g-1/5/6         |
| Laravel           |                            ~56k |            ~34–38k | P2f-a + P2g-3/4/10 sentry gate + P3 |
| Vendure           |                            ~68k |            ~48–52k | P2g-2 redis tier + P3               |
| WordPress Bedrock |                            ~56k |               ~48k | P2d wordpress-patterns drop         |

### P3 — Tier baseline (`haus-workflow-catalog` + recommender tests)

Estimated savings: ~37k tokens on every project (see P2g-1 for full tier breakdown).

**Keep `default: true` (6 skills):**

- `haus.writing-documentation`
- `haus.superpowers-using-superpowers`
- `haus.superpowers-brainstorming`
- `haus.superpowers-systematic-debugging`
- `haus.superpowers-verification-before-completion`
- `haus.superpowers-writing-plans`

**Remove `default: true` from remaining 10 superpowers** — gate behind opt-in (tag, `requiresAny`, or `--select` only). **P2g-1** adds near-duplicate pairs to this list (`writing-skills`, `subagent-driven-development`, `specifying-gates`, `checking-gates`, `receiving/requesting-code-review`, `using-git-worktrees`, `finishing-a-development-branch`, `test-driven-development`).

**Remove `default: true` from 5 always-on agents:**

- `haus.ecc-performance-optimizer`
- `haus.ecc-refactor-cleaner`
- `haus.oh-my-claudecode-test-engineer`
- `haus.oh-my-claudecode-designer`
- `haus.oh-my-claudecode-tracer`

- [ ] **P3-1** — Decide extended-workflow auto-install policy for Haus repos (recommender signal vs manual opt-in)
- [ ] **P3-2** — Update `default: true` flags in `manifest.json`
- [ ] **P3-3** — Update golden archetype / `recommend-eligibility` tests in CLI
- [ ] **P3-4** — `yarn validate` + catalog release + CLI fixture sync + `yarn verify`

### P4 — Agent dedup (`haus-workflow-catalog`)

- [ ] **P4-1** — Remove `haus.ecc-build-error-resolver` (overlaps `haus.ecc-react-build-resolver` on React stacks)
- [ ] **P4-2** — Keep `haus.ecc-react-reviewer` + `haus.ecc-typescript-reviewer` (complementary scopes)
- [ ] **P4-3** — Manifest version bump; validate; release; fixture sync

### P5 — Docs & migration (`both`)

- [ ] **P5-1** — `haus-workflow/docs/runbook.md` — add deprecated prune behavior after P0
- [ ] **P5-2** — `haus-workflow-catalog/docs/` — baseline tiering note or ADR (if P3 ships)
- [ ] **P5-3** — Release notes: "Upgrade CLI, then run `haus update` to prune deprecated skills"
- [ ] **P5-4** — Confirm writing-documentation skill run if CLI/catalog structure docs changed

---

## Risk matrix

| Risk                                                     | Mitigation                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Deprecated files linger until P0 CLI ships               | ✅ Shipped P0 + P1; upgrade CLI then `haus update` to prune                         |
| User customized deprecated skill                         | Hash gate preserves copy (unchanged contract)                                       |
| Baseline tier breaks teams expecting all superpowers     | Release note + explicit opt-in path                                                 |
| Dropping haus nextjs/react loses thin conventions refs   | ECC frontend is 3–4× richer; haus refs are generic best practices, not org-specific |
| Curated skill token cost rises on React stacks           | Trade accepted — correctness over minimal token budget for stack guidance           |
| P2g recommender gating breaks golden archetypes          | Update `recommend-archetypes-golden.json` per phase; pin must-include only          |
| Redis/security tier leaves ops gaps on Vendure           | Document opt-in path for `redis-security` + `redis-observability`                   |
| Dropping sentry-workflow loses generic Sentry onboarding | Only drop after P2f-c confirms stack SDK skills cover install/setup flows           |
| P2g-10 sentry-php gate breaks laravel golden archetype   | Update golden or add `sentry/sentry` to laravel fixture                             |

---

## Haus vs curated comparison (pass 2026-06-18)

Line counts include `SKILL.md` + all files under the skill dir. **Ratio** = curated ÷ haus.

| Stack                                | Haus-owned                                             | Curated alternative                                               | Haus lines | Curated lines | Ratio | Verdict                                                         |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- | ---------: | ------------: | ----: | --------------------------------------------------------------- |
| Next.js                              | `nextjs-patterns`                                      | `ecc-frontend-patterns`                                           |       ~190 |          ~658 |  3.5× | **Drop haus** (P2a)                                             |
| React 19                             | `react19-patterns`                                     | `ecc-frontend-patterns`                                           |       ~190 |          ~658 |  3.5× | **Drop haus** (P2a)                                             |
| Vite 8                               | `vite8-patterns`                                       | `ecc-vite-patterns`                                               |       ~190 |          ~451 |  2.4× | **Drop haus** (P2a)                                             |
| shadcn/Radix                         | `radix-shadcn-patterns`                                | `wshobson-tailwind-design-system`                                 |       ~190 |          ~893 |  4.7× | **Drop haus** (P2a)                                             |
| Laravel                              | `laravel-patterns` ⚠️                                  | `ecc-laravel-patterns`                                            |       ~190 |          ~417 |  2.2× | **Drop haus** (P1, deprecated)                                  |
| NestJS GraphQL                       | `nestjs-graphql-patterns` ⚠️                           | `ecc-nestjs-patterns` + apollo×2                                  |       ~190 |         ~232+ | 1.2×+ | **Drop haus** (P1)                                              |
| Stripe                               | `stripe-patterns` ⚠️                                   | `stripe-stripe-best-practices`                                    |       ~190 |          ~408 |  2.1× | **Drop haus** (P1)                                              |
| Supabase                             | `supabase-patterns` ⚠️                                 | `supabase-supabase`                                               |       ~190 |          ~208 |  1.1× | **Drop haus** (P1) — official maintainer skill                  |
| Sanity                               | `sanity-patterns` ⚠️                                   | `sanity-content-modeling-best-practices`                          |       ~190 |          ~456 |  2.4× | **Drop haus** (P1)                                              |
| Tailwind/SCSS                        | `tailwind-scss-patterns` ⚠️                            | `wshobson-tailwind-design-system`                                 |       ~190 |          ~893 |  4.7× | **Drop haus** (P1)                                              |
| Database                             | `database-patterns` ⚠️                                 | `wshobson-postgresql-table-design` + redis×3                      |       ~190 |        varies |     — | **Drop haus** (P1)                                              |
| Sentry                               | `sentry-patterns` ⚠️                                   | `sentry-sentry-workflow` + `sentry-sentry-php-sdk`                |       ~190 |    ~49 router |     — | **Drop haus** (P1) — workflow is router; php-sdk adds PHP depth |
| TypeScript                           | `typescript5-patterns`                                 | —                                                                 |       ~190 |             — |     — | **Keep haus** — no curated skill                                |
| Vue                                  | `vue-patterns`                                         | `ecc/vue-patterns` _(sync P2c)_                                   |       ~190 |         ~500+ | 2.6×+ | **Drop haus; sync ECC** (P2c)                                   |
| Prisma                               | `prisma-patterns`                                      | `ecc/prisma-patterns` _(sync P2c)_                                |       ~190 |         ~400+ | 2.1×+ | **Drop haus; sync ECC** (P2c)                                   |
| Playwright                           | `playwright-patterns`                                  | `ecc/e2e-testing` _(sync P2c)_                                    |       ~190 |         ~350+ | 1.8×+ | **Drop haus; sync ECC** (P2c)                                   |
| RTL / component tests                | `testing-library-patterns`                             | `ecc/react-testing` _(sync P2c)_                                  |       ~190 |         ~400+ | 2.1×+ | **Drop haus; sync ECC** (P2c)                                   |
| .NET                                 | `dotnet-patterns` / `dotnet-service-patterns`          | `ecc/dotnet-patterns` _(sync P2c)_ + csharp-testing               |  ~190 each |         ~300+ | 1.6×+ | **Drop haus pair; sync ECC dotnet** (P2c)                       |
| WordPress (generic)                  | `wordpress-patterns`                                   | bedrock + acf/elementor (haus)                                    |       ~190 |             — |     — | **Drop generic** (P2d)                                          |
| Expo / RR v7 / Auth / Vendure / etc. | haus-only (see P2e)                                    | —                                                                 |   ~130–175 |             — |     — | **Keep haus**                                                   |
| PHPUnit / Vitest / Jest              | `phpunit-patterns`, `vitest-patterns`, `jest-patterns` | `ecc/laravel-tdd`, `wshobson/javascript-testing-patterns` _(P2f)_ |  ~190 each |         ~400+ |   2×+ | **Drop haus; sync upstream** (P2f)                              |

⚠️ = deleted in P1 (`v2.9.1`).

---

## Reference — overlap groups (audit summary)

| Group                                  | Items                                                                | Recommendation                                                       |
| -------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Already deprecated                     | 8 haus `*-patterns`                                                  | ✅ Deleted (P1); prune on update (P0)                                |
| Frontend / React / Next                | `ecc-frontend-patterns` + ~~`nextjs-patterns` + `react19-patterns`~~ | ✅ Drop haus (P2a); keep ECC                                         |
| Vite                                   | `ecc-vite-patterns` + ~~`vite8-patterns`~~                           | ✅ Drop haus (P2a); keep ECC                                         |
| shadcn / Tailwind                      | `wshobson-tailwind-design-system` + ~~`radix-shadcn-patterns`~~      | ✅ Drop haus (P2a); keep wshobson                                    |
| Prisma / Vue / .NET / Playwright / RTL | haus routers vs ECC upstream                                         | **Sync ECC** + drop haus (P2c)                                       |
| PHPUnit / Vitest / Jest                | haus routers vs ECC + wshobson                                       | **Sync** laravel-tdd + javascript-testing; drop haus (P2f)           |
| WordPress                              | patterns + bedrock + acf/elementor                                   | **Drop generic** patterns (P2d); keep bedrock + acf                  |
| Stripe                                 | best-practices + upgrade + projects                                  | Keep best-practices; drop upgrade + projects (P2b)                   |
| Laravel                                | ecc-laravel + verification + plugin-discovery + laravel-tdd          | Keep patterns + verification + tdd; gate plugin-discovery (P2g-4)    |
| Redis                                  | connections + security + observability                               | Tier connections only default (P2g-2)                                |
| Sentry                                 | workflow router + php-sdk (+ stack SDKs)                             | Drop workflow (P2g-3); **fix php-sdk laravel OR-gate (P2g-10)**      |
| TanStack                               | tanstack-query-router + `@tanstack/*` catch-all                      | Tighten gate — virtual-only false positive (P2g-10)                  |
| Nx monorepo                            | nx21 + `@nx/*` catch-all                                             | Drop `@nx/*` pattern (P2g-10)                                        |
| Storybook                              | storybook + redundant `@storybook/*`                                 | Drop catch-all pattern (P2g-10)                                      |
| Testing (E2E)                          | e2e-testing skill + e2e-runner agent + TDD superpower                | Gate agent + TDD superpower (P2g-5)                                  |
| React agents                           | react-reviewer + typescript-reviewer + build-error-resolver          | Gate TS reviewer on non-React; drop build-error-resolver (P4, P2g-6) |
| Superpowers baseline                   | 16 workflow skills                                                   | Tier to 6 core + P2g-1 near-dup gates (P3)                           |
| Docker                                 | sickn33 docker-expert vs ecc/docker-patterns                         | Swap to ECC if quality OK (P2g-8)                                    |
| Database                               | postgresql-table-design + database-reviewer + prisma-patterns        | Keep; optional gate database-reviewer (P2g-7)                        |
| Testing agents                         | oh-my test-engineer + ecc-e2e-runner                                 | Remove test-engineer from baseline (P3); gate e2e-runner (P2g-5)     |
| .NET (after P2c)                       | `ecc/dotnet-patterns` + `ecc-csharp-testing`                         | Keep both — patterns vs testing                                      |
| Vendure                                | vendure-app + vendure-plugin                                         | Keep both haus; different roles                                      |

---

## Stack install matrix (reference)

| Project profile   | Skills | Agents | Notable stack-specific adds                                                        |
| ----------------- | -----: | -----: | ---------------------------------------------------------------------------------- |
| Unknown / minimal |     17 |      5 | —                                                                                  |
| Next.js           |     23 |     10 | typescript5, ecc-frontend, wshobson-tailwind (+ haus nextjs/react/radix until P2a) |
| React + Vite      |     22 |      9 | typescript5, ecc-frontend, ecc-vite (+ haus react/vite until P2a)                  |
| NestJS API        |     21 |      8 | typescript5, ecc-nestjs, apollo×2                                                  |
| Vendure           |     27 |      7 | vendure-app/plugin, bullmq, redis×3, ecc-nestjs, apollo×2                          |
| Laravel           |     22 |      6 | phpunit, ecc-laravel×3, sentry-php-sdk                                             |
| .NET service      |     20 |      6 | dotnet-patterns, dotnet-service, ecc-csharp-testing                                |
| Vue               |     21 |      8 | vue, vite8, typescript5, ecc-vite                                                  |
| WordPress Bedrock |     20 |      6 | wordpress×3                                                                        |
| Expo              |     20 |      5 | expo-rn, react19, ecc-frontend                                                     |
| Nx monorepo       |     21 |      9 | nx21, react19, typescript5, ecc-frontend                                           |

_Counts are pre-cleanup. P1 drops 8 deprecated; P2a–P2d drop 10 haus-owned (+ sync 5 ECC); P2f drops 3 haus (+ sync 2). P2g tiers co-install clusters (no catalog delete). P3–P4 reduce baseline/agents._
