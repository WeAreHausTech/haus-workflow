---
date: 2026-05-22
status: current
---

## `haus` — Full project handover

**Version:** 0.1.0 | **Runtime:** Node ≥22 | **Package manager:** Yarn 4 | **Main branch:** `main`

---

### What the project is

`haus` is a TypeScript CLI (`haus` binary) + Claude Code plugin. It scans a repo, scores + recommends context assets from a curated catalog, then writes controlled files into `.claude/` and `.haus-ai/`. The Claude Code plugin wires hooks that inject this context automatically into every session.

Two distribution paths:

| Path | How |
|---|---|
| CLI | Not on npm. Install from a checkout: `yarn install && yarn build && npm install -g .` (or `yarn pack` + `npm install -g ./package.tgz`) |
| Plugin | `/plugin marketplace add WeAreHausTech/haus-ai-workflow` → `/plugin install haus-workflow@haus-marketplace` (repo is **private** — requires authenticated git access: SSH key or `gh auth login`) |

---

### Directory map

```
src/
  cli.ts                   CLI entry, all command registration
  commands/                Thin handlers — one file per command, delegate to core
  scanner/                 Repo detection → context-map.json
  recommender/             Scoring, explainability, task-intent classification
  claude/                  write-claude-files.ts, load-hooks.ts, settings writer
  update/                  Lockfile checks, hash refresh, backup
  memory/                  Local memory store + redaction
  security/                Guardrails for sensitive paths + dangerous bash
  utils/                   logger.ts, fs.ts, paths.ts, audit-checks.ts
  library/                 Catalog loader + audit logic
  catalog/                 Manifest types and loader
  sources/                 External source sync, audit, report
  curation/                Unsupported-stack token detection

library/catalog/
  manifest.json            35 items (30 skills, 5 agents) — source of truth for recommender
  sources.yaml             All approved external sources
  allowed-stacks.json      Canonical stack tokens for signal matching

plugin/
  .claude-plugin/plugin.json   Plugin manifest (name, version, metadata)
  skills/*/SKILL.md            6 plugin skills (auto-discovered by Claude Code)
  agents/*.md                  5 plugin subagents (auto-discovered by Claude Code)
  hooks/hooks.json             Hook contract — source of truth for apply + doctor

tests/                     Node built-in runner, 107 tests, no framework
scripts/                   Audit scripts (tsx, not compiled) — run during prepack
docs/                      18 reference docs + docs/specs/ for design specs
```

---

### CLI commands

| Command | Purpose |
|---|---|
| `haus init` | First-run entry point — checks `.haus-ai/` exists, else runs `setup-project` |
| `haus setup-project` | Reconfigure existing setup (guided or fast) |
| `haus scan --json` | Detect repo stack → `.haus-ai/context-map.json` |
| `haus recommend --json` | Score catalog against scan → `.haus-ai/recommendation.json` |
| `haus apply --dry-run` | Show per-file unified diffs without writing |
| `haus apply --write` | Write `.claude/` files, lock file, selected-context |
| `haus doctor` | Health check: missing files, hook mismatch warnings |
| `haus doctor --hooks` | Strict: exits 1 if settings.json diverges from plugin hook contract |
| `haus update --check` | Detect stale lockfile |
| `haus update` | Refresh hashes, backup old lock, print diff |
| `haus context --task <t> --json --verbose` | Task-scoped rule selection; `--verbose` adds score breakdown |
| `haus explain-context --json` | Full context explainability (selected/skipped/stats) |
| `haus explain-recommendation --json` | Recommendation explainability with confidence + reasons |
| `haus memory status/add/inject/promote` | Local memory store operations |
| `haus guard file-access / bash` | Hook-invoked guardrails (called by Claude Code hooks) |
| `haus plugin validate` | Check plugin structure (plugin.json + hooks.json) |
| `haus sources sync/report/audit` | External source management |
| `haus refresh` | Force re-scan + re-recommend |
| `haus undo --yes` | Remove `.claude/` and `.haus-ai/` |

---

### Plugin skills (in `plugin/skills/`)

| Skill | Purpose |
|---|---|
| `haus-setup-project` | Conversational first-run setup (one-question-at-a-time, approval gate) |
| `haus-context-router` | Route context queries to right command |
| `haus-workflow` | Guide daily workflow (scan → recommend → apply) |
| `haus-global-engineering-rules` | Apply global rules baseline |
| `haus-skill-author` | Author new catalog skills |
| `haus-documentation-maintainer` | Maintain project docs |

All skills must be ≤80 lines. `tests/core-skill-shape.test.js` enforces this.

---

### Hook contract

Source of truth: `plugin/hooks/hooks.json`

Written to `.claude/settings.json` by `haus apply --write`. All commands use `|| true` so missing `haus` binary never breaks a Claude session.

| Event | Hook command |
|---|---|
| `UserPromptSubmit` | `haus context --from-hook \|\| true` |
| `UserPromptSubmit` | `haus memory inject --from-hook \|\| true` |
| `PreToolUse` (Read\|Edit\|Write) | `haus guard file-access --from-hook \|\| true` |
| `PreToolUse` (Bash) | `haus guard bash --from-hook \|\| true` |

---

### Key data files

| File | Written by | Read by |
|---|---|---|
| `.haus-ai/context-map.json` | `haus scan` | `recommend`, `context`, `apply` |
| `.haus-ai/recommendation.json` | `haus recommend` | `context`, `explain-*`, `apply` |
| `.haus-ai/haus.lock.json` | `haus apply --write` | `haus update` |
| `.haus-ai/selected-context.json` | `haus apply --write` | reference only |
| `.claude/settings.json` | `haus apply --write` | Claude Code, `doctor --hooks` |
| `.claude/rules/haus.md` | `haus apply --write` | Claude Code |
| `.claude/rules/security.md` | `haus apply --write` | Claude Code |

---

### Test suite (107 tests)

Tests use Node's built-in runner + `execa`. No Jest/Vitest. Run with `yarn test`.

Notable test files:
- `apply.test.js` — file writing, dry-run, overwrite diffs, hook commands
- `context-explain.test.js` — explain-context, explain-recommendation, verbose breakdown
- `init.test.js` — already-initialized skip, first-run creation
- `context-goldens.test.js` + `cross-bleed.test.js` — rule selection accuracy per fixture
- `core-skill-shape.test.js` — plugin skill ≤80 line budget
- `doctor.test.js` — hook contract check
- `generated-primitives-shape.test.js` — CLAUDE.md router shape

Fixtures live in `tests/fixtures/` (vendure-monorepo, nextjs-app, laravel-app, etc).

---

### Build + verify gate

```bash
yarn build          # tsup src/ → dist/
yarn verify         # typecheck + typecheck:scripts + lint + build + test + prepack
```

`prepack` runs all `scripts/*.ts` audit scripts via `tsx`. These validate catalog integrity, source decisions, curation decisions, library structure. Do not skip.

Module boundaries enforced by ESLint import/order rules:
- `src/commands/` — thin only, no cross-command imports
- `src/utils/` — no scanner/recommender/claude imports
- `src/security/` — only `src/utils/`
- No `console.*` anywhere in `src/` — use `log`/`warn`/`error` from `src/utils/logger.ts`

---

### CI

| Workflow | Trigger | What it runs |
|---|---|---|
| `quality.yml` | PR only | `yarn verify` (full gate) |
| `ci.yml` | push + PR | build + test |
| `source-check.yml` | PR touching sources | source audit scripts |

---

### What's complete (Phase 2)

| Item | PR | Status |
|---|---|---|
| B0 — plugin install story fix | #17 | ✅ merged |
| A2 — setup-project skill conversational rewrite | #18 | ✅ merged |
| B3 — `apply --dry-run` unified diffs | #19 | ✅ merged |
| B5 — `haus init` first-run command | #19 | ✅ merged |
| B1 — `context --verbose` score breakdown | #19 | ✅ merged |
| A3 — README install instructions | #20 | ✅ merged |
| A4 — End-to-end plugin install verification | manual | ✅ complete |

---

### What's left

**B4 — Network fetch for remote catalog**

Design spec at `docs/specs/2026-05-22-b4-remote-catalog-design.md`. Implementation in progress.

**Future phase — CLI and plugin versioning**

Deferred. See the future versioning section in the B4 spec for decisions recorded so far. Key item: `haus plugin update` command that re-runs the marketplace add + install flow without requiring manual commands.

---

### Known architectural decisions

- `normalizeRecommendation()` zeroes `scoreBreakdown.penalties` (reconstructs from reasons array). `context --verbose` bypasses this by reading `rawBreakdownById` directly from `recommendation.json`. Don't route verbose breakdown through `normalizeRecommendation`.
- Plugin `marketplace.json` is at repo root — Claude Code reads it when `/plugin marketplace add <owner>/<repo>` is called.
- Hook commands are embedded in two places: `plugin/hooks/hooks.json` (authoritative) and `src/claude/load-hooks.ts` (`EMBEDDED_HOOKS` fallback). Both must be kept in sync when hook commands change.
- Dry-run threads `dryRun: boolean` through `writeManagedText` / `writeManagedJson` — it does NOT early-exit before computing diffs. Lock + selected-context files excluded from dry-run file list.
- `setup-project` is still the reconfigure command; `init` delegates to it. Don't merge them — `init` is the new-project entry point, `setup-project` stays for re-runs.
