# Detection improvement plan

Sourced from full wearehaustech org scan (May 2026). Each task is self-contained. New session can pick up any completed task and start the next.

---

## How to read this

- **`haus-ai-workflow`** = this repo — scanner code + test fixtures + `library/catalog/manifest.json`
- **`haus-workflow-catalog`** = separate repo — actual skill content (`skills/*/SKILL.md`, `manifest.json`)
- Every new stack token requires changes in **both** repos
- Every detection-only fix (no new skill) only touches `haus-ai-workflow`

---

## Phase 1 — Structural foundations (do these first, unblock PHP detection)

### T1 · Parse composer.json deps into phpDeps

**Repos:** `haus-ai-workflow` only

**Context:** `detectStacks` only receives `deps` from `package.json`. All PHP-based detection (Elementor, ACF, SAML2, Redis/Predis, Deployer) is blocked until `composer.json` `require` keys are available as a separate array.

**Changes — `src/scanner/scan-project.ts`:**
1. In `scanProject`, after reading `package.json` deps, read `composer.json` if present:
   ```ts
   const composerPath = path.join(root, "composer.json");
   let phpDeps: string[] = [];
   try {
     const composer = await readJson<{ require?: Record<string, string> }>(composerPath);
     phpDeps = Object.keys(composer?.require ?? {});
   } catch { /* not a PHP project */ }
   ```
2. Pass `phpDeps` into `detectRoles` and `detectStacks` as a new parameter.
3. In `detectStacks` signature: `async function detectStacks(root, deps, phpDeps, files, packageManager)`
4. Add all subsequent PHP-based detection using `phpDeps.includes(...)`.

**Verification:** `yarn test` passes. Add test fixture with `composer.json` and assert phpDeps are passed through.

---

### T2 · Wire detect-node.ts

**Repos:** `haus-ai-workflow` only

**Context:** `src/scanner/detect-node.ts` exists and has a TODO comment but is never imported or called from `scan-project.ts`.

**Changes — `src/scanner/scan-project.ts`:**
1. Import `detectNode` from `./detect-node.js`.
2. Call it after `detectStacks` and merge result into `stacks.tooling`.
3. Check what `detectNode` currently emits and ensure token naming matches catalog convention (e.g. `node`).

**Verification:** `yarn test` passes. Repo with `.nvmrc` or `engines.node` in `package.json` gets `node` token.

---

## Phase 2 — Testing tokens (high impact, no dependencies)

### T3 · Vitest detection + catalog item

**Repos:** both

**Context:** Vitest is used in 5+ haus repos (`hemglass-ecom`, `cellink-portal`, `haus-tech-vendure-plugins`, `haus-storefront-components`, `haus-commerce-builder`). Currently undetected. Biggest testing gap.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts` → `detectStacks`:
  ```ts
  if (deps.includes("vitest")) add("testing", "vitest");
  ```
- `library/catalog/manifest.json` → add entry:
  ```json
  {
    "id": "haus.vitest-patterns",
    "source": "haus",
    "type": "skill",
    "path": "tests/fixtures/catalog/skills/vitest-patterns",
    "title": "Haus Vitest patterns",
    "purpose": "Guide Vitest test structure, mocking, and coverage configuration.",
    "whenToUse": "Use when writing or modifying Vitest tests.",
    "whenNotToUse": "Do not use for Jest or Playwright tests.",
    "references": [],
    "safetyNotes": [],
    "tokenBudget": 1200,
    "tags": ["testing", "vitest", "typescript"],
    "repoRoles": [],
    "requiresAny": [{"stack": "vitest"}, {"dependency": "vitest"}],
    "tokenEstimate": 1200,
    "installMode": "copy-selected"
  }
  ```
- `tests/fixtures/catalog/skills/vitest-patterns/SKILL.md` → create stub

**Changes — `haus-workflow-catalog`:**
- `skills/vitest-patterns/SKILL.md` → create full skill
- `skills/vitest-patterns/references/` → create conventions, scope, workflow refs
- `manifest.json` → add same entry (with `path: "skills/vitest-patterns"`)

**Verification:** `yarn test`. Repo with `vitest` dep gets `testing: ["vitest"]` in context map.

---

### T4 · Jest detection + catalog item

**Repos:** both

**Context:** Jest is used in `haus-storefront-components` (Nx setup). Less prevalent than Vitest but present.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts` → `detectStacks`:
  ```ts
  if (deps.includes("jest") || deps.includes("jest-environment-jsdom")) add("testing", "jest");
  ```
- `library/catalog/manifest.json` → add entry for `haus.jest-patterns`
- `tests/fixtures/catalog/skills/jest-patterns/SKILL.md` → stub

**Changes — `haus-workflow-catalog`:**
- `skills/jest-patterns/SKILL.md` + refs
- `manifest.json` entry

**Verification:** `yarn test`. Repo with `jest` dep gets `testing: ["jest"]`.

---

## Phase 3 — WordPress / Elementor stack (requires T1)

### T5 · Elementor detection via composer deps

**Repos:** `haus-ai-workflow` only (catalog item `haus.wordpress-acf-elementor-jetengine-patterns` already exists)

**Context:** `detectStacks` sets `wordpress` token only if `wp-config.php` exists. Elementor is installed via composer — never detected. All WP Bedrock sites use `wpackagist-plugin/elementor` or `wearehaus/elementor-pro`.

**Changes — `src/scanner/scan-project.ts`:**
```ts
// Elementor (free or pro)
if (
  phpDeps.includes("wpackagist-plugin/elementor") ||
  phpDeps.includes("wearehaus/elementor-pro") ||
  phpDeps.includes("wpackagist-theme/hello-elementor")
) {
  add("backend", "elementor");
}
```

Also ensure `detectRoles` adds `wordpress-bedrock-site` when `phpDeps.includes("roots/wordpress")` — this unblocks the existing `haus.wordpress-acf-elementor-jetengine-patterns` catalog item which matches on `role: wordpress-bedrock-site`.

**Verification:** Test fixture with `composer.json` containing `wearehaus/elementor-pro` gets `backend: ["elementor"]`.

---

### T6 · Improve ACF Pro + JetEngine detection (requires T1)

**Repos:** `haus-ai-workflow` only (catalog items exist)

**Context:** `haus.wordpress-acf-elementor-jetengine-patterns` exists but triggers only on role, not specific composer deps. Strengthen signal.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (phpDeps.includes("wearehaus/advanced-custom-fields-pro") || phpDeps.includes("wpackagist-plugin/advanced-custom-fields")) {
  add("backend", "acf-pro");
}
if (phpDeps.includes("wearehaus/jet-engine")) add("backend", "jetengine");
if (phpDeps.includes("wearehaus/jet-smart-filters")) add("backend", "jetsmartfilters");
if (phpDeps.includes("wearehaus/gravityforms")) add("backend", "gravityforms");
```

Update `haus.wordpress-acf-elementor-jetengine-patterns` manifest entry `requiresAny` to add:
```json
{"stack": "elementor"}, {"stack": "acf-pro"}, {"stack": "jetengine"}
```

**Verification:** WP Bedrock fixture with these composer deps gets correct stack tokens.

---

### T7 · Redis detection — PHP + JS (requires T1 for PHP side)

**Repos:** `haus-ai-workflow` only

**Context:** Redis used via `predis/predis` (Laravel) and potentially `ioredis` (Node). Currently undetected. No catalog item needed — handled by existing `haus.database-patterns` after adding token to its `requiresAny`.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (phpDeps.includes("predis/predis")) add("databases", "redis");
if (deps.includes("ioredis") || deps.includes("redis")) add("databases", "redis");
```

Update `library/catalog/manifest.json` entry for `haus.database-patterns` — add `{"stack": "redis"}` to `requiresAny`.

**Changes — `haus-workflow-catalog`:**
Update `manifest.json` `haus.database-patterns` `requiresAny` to include `{"stack": "redis"}`. Update `SKILL.md` to mention Redis patterns.

**Verification:** Laravel fixture with predis dep gets `databases: ["redis"]`.

---

## Phase 4 — Frontend framework gaps

### T8 · React Router v7 detection + catalog item

**Repos:** both

**Context:** React Router v7 used as SSR framework (like Remix) in `kulturarvvastmanland-audio-walks` and `cellink-portal-frontend`. Key signals: `react-router` dep + `@react-router/node` dep (SSR) or `react-router build` script.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("react-router") && deps.includes("@react-router/node")) {
    add("frontend", "react-router-v7");
  }
  ```
- `detectRoles`: add `react-router-app` role on same condition
- `library/catalog/manifest.json` → add `haus.react-router-v7-patterns` entry
- `tests/fixtures/catalog/skills/react-router-v7-patterns/SKILL.md` → stub

**Changes — `haus-workflow-catalog`:**
- `skills/react-router-v7-patterns/SKILL.md` + refs
- `manifest.json` entry

**Verification:** Fixture with both deps gets `frontend: ["react-router-v7"]` and role `react-router-app`.

---

### T9 · TypeScript catalog item rename (typescript6 → typescript5)

**Repos:** both

**Context:** User confirmed TypeScript 5.x is correct. The catalog item is currently named `haus.typescript6-patterns` with dir `typescript6-patterns`. Detection signal `{"dependency": "typescript"}` is fine — just rename everything.

**Changes — `haus-ai-workflow`:**
- `library/catalog/manifest.json`: rename id to `haus.typescript5-patterns`, title to "Haus TypeScript 5 patterns", path to `tests/fixtures/catalog/skills/typescript5-patterns`
- Rename dir `tests/fixtures/catalog/skills/typescript6-patterns/` → `typescript5-patterns/`
- Add `typescript5` to detectable tokens: `if (deps.includes("typescript")) add("tooling", "typescript5");`

**Changes — `haus-workflow-catalog`:**
- Rename `skills/typescript6-patterns/` → `skills/typescript5-patterns/`
- Update `manifest.json` id + title + path
- Update `SKILL.md` frontmatter name field

**Verification:** `yarn test` passes. Repo with `typescript` dep gets `tooling: ["typescript5"]`.

---

### T10 · Tailwind CSS detection improvement

**Repos:** `haus-ai-workflow` only (catalog item `haus.tailwind-scss-patterns` already exists and matches `{"dependency": "tailwindcss"}`)

**Context:** Detection via `requiresAny` dependency match already works. But `detectStacks` never emits a `tailwindcss` stack token — it only has `vite8`, `nextjs` etc. Add the token so context map reflects it.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (deps.includes("tailwindcss") || files.some(f => f.includes("tailwind.config."))) {
  add("frontend", "tailwindcss");
}
```

**Verification:** Fixture with `tailwindcss` dep or `tailwind.config.ts` file gets `frontend: ["tailwindcss"]`.

---

### T11 · Shadcn/ui detection improvement

**Repos:** `haus-ai-workflow` only (catalog item `haus.radix-shadcn-patterns` already exists)

**Context:** `components.json` is already in SAFE_FILES but never queried in `detectStacks`. Shadcn installs it at root. Add explicit token.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (
  files.some(f => f.endsWith("components.json")) &&
  deps.includes("class-variance-authority")
) {
  add("frontend", "shadcn");
}
```

Update `library/catalog/manifest.json` `haus.radix-shadcn-patterns` `requiresAny` to add `{"stack": "shadcn"}`.

**Verification:** Fixture with `components.json` + `class-variance-authority` dep gets `frontend: ["shadcn"]`.

---

## Phase 5 — CMS / headless

### T12 · Sanity v5 detection + catalog item

**Repos:** both

**Context:** Sanity v5 used in `new.convendum.se` via `sanity`, `next-sanity`, `@sanity/client`. Growing pattern.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("sanity") || deps.includes("next-sanity") || deps.includes("@sanity/client")) {
    add("backend", "sanity");
  }
  ```
- `detectRoles`: add `sanity-studio` role when `deps.includes("sanity")`
- Manifest entry + fixture stub for `haus.sanity-patterns`

**Changes — `haus-workflow-catalog`:**
- `skills/sanity-patterns/SKILL.md` + refs
- `manifest.json` entry with `requiresAny: [{"stack": "sanity"}, {"dependency": "sanity"}, {"dependency": "next-sanity"}]`

**Verification:** Fixture with `sanity` dep gets `backend: ["sanity"]`.

---

### T13 · Strapi 5 detection + catalog item

**Repos:** both

**Context:** Strapi 5 used in `cellink-portal`. Key dep: `@strapi/strapi`.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("@strapi/strapi") || deps.some(d => d.startsWith("@strapi/"))) {
    add("backend", "strapi");
  }
  ```
- `detectRoles`: add `strapi-app` role on same condition
- Manifest entry + fixture stub for `haus.strapi-patterns`

**Changes — `haus-workflow-catalog`:**
- `skills/strapi-patterns/SKILL.md` + refs
- `manifest.json` entry

**Verification:** Fixture with `@strapi/strapi` dep gets `backend: ["strapi"]` and role `strapi-app`.

---

### T14 · Prisma detection + catalog item

**Repos:** both

**Context:** Prisma 6 ORM used in `samsa` (Next.js app). Common in Next.js + PostgreSQL setups.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("prisma") || deps.includes("@prisma/client")) {
    add("backend", "prisma");
  }
  ```
- Manifest entry + fixture stub for `haus.prisma-patterns`

**Changes — `haus-workflow-catalog`:**
- `skills/prisma-patterns/SKILL.md` + refs
- `manifest.json` entry

**Verification:** Fixture with `@prisma/client` dep gets `backend: ["prisma"]`.

---

## Phase 6 — Database gaps

### T15 · MySQL package detection fix

**Repos:** `haus-ai-workflow` only

**Context:** Current code checks `mysql2` and `mariadb` but not `mysql` (the older package). Both `hemglass-ecom` and `livv-ecom` use `mysql`. Should emit `mariadb` token (same catalog item) or add separate `mysql` token. Decision: emit `mysql` token, add to existing `haus.database-patterns` `requiresAny`.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (deps.includes("mysql") || deps.includes("mysql2")) add("databases", "mysql");
// existing mariadb line stays for mariadb-specific driver
```

Update `library/catalog/manifest.json` `haus.database-patterns` `requiresAny`: add `{"stack": "mysql"}`.

**Changes — `haus-workflow-catalog`:**
Update `manifest.json` same entry. Update `SKILL.md` to mention MySQL.

---

## Phase 7 — Auth gaps

### T16 · SAML2 detection + catalog item (requires T1)

**Repos:** both

**Context:** SAML2 used in `prosang-webbokning-3` via `24slides/laravel-saml2` (composer). Laravel + SAML2 = enterprise SSO pattern.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (phpDeps.includes("24slides/laravel-saml2") || phpDeps.includes("aacotroneo/laravel-saml2")) {
    add("auth", "saml2");
  }
  ```
- Manifest entry + fixture stub for `haus.saml2-patterns`
  OR: extend `haus.auth-oidc-azure-bankid-patterns` to cover SAML2 — decision: extend since it's all enterprise auth.

Update `haus.auth-oidc-azure-bankid-patterns` title → "Haus enterprise auth patterns (OIDC / Azure AD / BankID / SAML2)", add `{"stack": "saml2"}` to `requiresAny`.

**Changes — `haus-workflow-catalog`:**
Rename/update `auth-oidc-azure-bankid-patterns` SKILL.md to include SAML2 section. Update manifest.

**Verification:** Laravel fixture with `24slides/laravel-saml2` gets `auth: ["saml2"]`.

---

### T17 · NextAuth.js detection + catalog item

**Repos:** both

**Context:** `next-auth` used in `samsa` (Next.js). Common pattern for Next.js apps needing session auth.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("next-auth") || deps.includes("@auth/core")) add("auth", "next-auth");
  ```
- Manifest entry + fixture stub for `haus.nextauth-patterns`

**Changes — `haus-workflow-catalog`:**
- `skills/nextauth-patterns/SKILL.md` + refs
- `manifest.json` entry

---

## Phase 8 — Mobile

### T18 · Expo / React Native detection + catalog item

**Repos:** both

**Context:** Expo + expo-router used in `haus-storefront-expo-app` and `haus-storefront-components`. React Native target. Key signal: `expo` dep + `expo-router`.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts`:
  ```ts
  if (deps.includes("expo")) add("frontend", "expo");
  if (deps.includes("react-native")) add("frontend", "react-native");
  ```
- `detectRoles`: add `expo-app` role when `deps.includes("expo")`
- Manifest entry + fixture stub for `haus.expo-react-native-patterns`

**Changes — `haus-workflow-catalog`:**
- `skills/expo-react-native-patterns/SKILL.md` + refs
- `manifest.json` entry

---

## Phase 9 — Tooling / infra

### T19 · Prettier + ESLint enforcement catalog items

**Repos:** both

**Context:** Both should be in every repo. Goal: detect absence and recommend catalog item that installs `@haus-tech/prettier-config` + `@haus-tech/tech-config` eslint setup. Detected by absence, not presence.

**Changes — `haus-ai-workflow`:**
- `src/scanner/scan-project.ts` — add inverse detection: emit `missing-prettier` / `missing-eslint` tokens when deps absent:
  ```ts
  if (!deps.includes("prettier")) add("tooling", "missing-prettier");
  if (!deps.includes("eslint")) add("tooling", "missing-eslint");
  ```
- Manifest entries for `haus.prettier-setup` + `haus.eslint-setup` with `requiresAny: [{"stack": "missing-prettier"}]` etc.
- Fixture stubs

**Changes — `haus-workflow-catalog`:**
- `skills/prettier-setup/SKILL.md` — install `@haus-tech/prettier-config`, add `.prettierrc` pointing to it
- `skills/eslint-setup/SKILL.md` — install `@haus-tech/tech-config`, configure flat config
- Both manifest entries

---

### T20 · i18next detection + catalog item

**Repos:** both

**Context:** `i18next` + `react-i18next` used universally across all TS frontends. High-value skill for translation patterns.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.includes("i18next") || deps.includes("react-i18next")) add("tooling", "i18next");
```
Manifest + fixture stub for `haus.i18next-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/i18next-patterns/SKILL.md` + refs
- `manifest.json` entry

---

### T21 · BullMQ detection + catalog item

**Repos:** both

**Context:** BullMQ used in all Vendure backends for job queues. Key dep: `bullmq`.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.includes("bullmq")) add("tooling", "bullmq");
```
Manifest + fixture stub for `haus.bullmq-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/bullmq-patterns/SKILL.md` + refs
- `manifest.json` entry with `requiresAny: [{"stack": "bullmq"}, {"dependency": "bullmq"}]`

---

### T22 · Docker detection

**Repos:** `haus-ai-workflow` only

**Context:** Docker used in all Vendure backends. Signal: `Dockerfile` at root or `docker-compose.*`. No dedicated catalog item needed — context signal only (helps recommender score infra-related skills).

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (files.some(f => f === "Dockerfile" || f.startsWith("docker-compose"))) {
  add("tooling", "docker");
}
```

Note: `docker-compose.*` is already in SAFE_FILES so it's picked up by `listFiles`.

---

### T23 · PM2 detection

**Repos:** `haus-ai-workflow` only

**Context:** PM2 used as process manager in Vendure backends. Signal: `pm2` dep or `ecosystem.config.js`.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (deps.includes("pm2") || files.some(f => f.includes("ecosystem.config"))) {
  add("tooling", "pm2");
}
```

---

### T24 · Sentry detection + catalog item

**Repos:** both

**Context:** Sentry used in `hemglass-ecom` via `@sentry/node`. Error monitoring pattern.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.some(d => d.startsWith("@sentry/"))) add("tooling", "sentry");
```
Manifest + fixture stub for `haus.sentry-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/sentry-patterns/SKILL.md` + refs
- `manifest.json` entry

---

### T25 · Deployer PHP detection (requires T1)

**Repos:** `haus-ai-workflow` only

**Context:** Deployer (`deployer/deployer`) used in all Laravel + WP repos for SSH-based deployment. No catalog item needed — context signal.

**Changes — `src/scanner/scan-project.ts`:**
```ts
if (phpDeps.includes("deployer/deployer")) add("tooling", "deployer-php");
```

---

## Phase 10 — Payments

### T26 · Stripe detection + catalog item

**Repos:** both

**Context:** Stripe used in elementor widget repos via `@stripe/react-stripe-js` + `@stripe/stripe-js`. Payment integration pattern.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.includes("@stripe/stripe-js") || deps.includes("@stripe/react-stripe-js")) {
  add("tooling", "stripe");
}
```
Manifest + fixture stub for `haus.stripe-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/stripe-patterns/SKILL.md` + refs
- `manifest.json` entry

---

### T27 · Qliro detection + catalog item

**Repos:** both

**Context:** Qliro (Nordic payment provider) used in `hemglass-ecom` via `@haus-tech/qliro-plugin`.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.includes("@haus-tech/qliro-plugin")) add("tooling", "qliro");
```
Manifest + fixture stub for `haus.qliro-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/qliro-patterns/SKILL.md` + refs
- `manifest.json` entry

---

### T28 · Supabase detection + catalog item

**Repos:** both

**Context:** Supabase used in `hausforge-creative-hub`. BaaS alternative to custom auth/db. Signal: `@supabase/supabase-js`.

**Changes — `haus-ai-workflow`:**
```ts
if (deps.includes("@supabase/supabase-js") || deps.some(d => d.startsWith("@supabase/"))) {
  add("databases", "supabase");
}
```
Manifest + fixture stub for `haus.supabase-patterns`.

**Changes — `haus-workflow-catalog`:**
- `skills/supabase-patterns/SKILL.md` + refs
- `manifest.json` entry

---

## Summary table

| Task | Phase | Repos | Deps |
|------|-------|-------|------|
| T1 · composer.json parsing | 1 | haus-ai-workflow | — |
| T2 · wire detect-node.ts | 1 | haus-ai-workflow | — |
| T3 · Vitest | 2 | both | T1 not required |
| T4 · Jest | 2 | both | — |
| T5 · Elementor | 3 | haus-ai-workflow | T1 |
| T6 · ACF + JetEngine | 3 | haus-ai-workflow | T1 |
| T7 · Redis | 3 | haus-ai-workflow + catalog update | T1 (PHP side) |
| T8 · React Router v7 | 4 | both | — |
| T9 · TypeScript rename | 4 | both | — |
| T10 · Tailwind token | 4 | haus-ai-workflow | — |
| T11 · Shadcn token | 4 | haus-ai-workflow | — |
| T12 · Sanity | 5 | both | — |
| T13 · Strapi | 5 | both | — |
| T14 · Prisma | 5 | both | — |
| T15 · MySQL fix | 6 | haus-ai-workflow + catalog update | — |
| T16 · SAML2 | 7 | both | T1 |
| T17 · NextAuth | 7 | both | — |
| T18 · Expo | 8 | both | — |
| T19 · Prettier + ESLint enforcement | 9 | both | — |
| T20 · i18next | 9 | both | — |
| T21 · BullMQ | 9 | both | — |
| T22 · Docker | 9 | haus-ai-workflow | — |
| T23 · PM2 | 9 | haus-ai-workflow | — |
| T24 · Sentry | 9 | both | — |
| T25 · Deployer PHP | 9 | haus-ai-workflow | T1 |
| T26 · Stripe | 10 | both | — |
| T27 · Qliro | 10 | both | — |
| T28 · Supabase | 10 | both | — |
