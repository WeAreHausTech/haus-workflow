# Plan: Remove the `haus context` UserPromptSubmit hook + downstream

> Status: **Proposal — ready to execute once [#103](https://github.com/WeAreHausTech/haus-workflow/pull/103) merges.**
> No stacking (per WORKFLOW.md). Own branch `refactor/remove-context-hook`, own PR.
> Reference docs: `.claude/WORKFLOW.md`, `.claude/workflow-config.md`.

## Why

The `context` UserPromptSubmit hook ships in every project's `settings.json` but is gated
**default-off** (`config.json` → `hooks.context.enabled`). When off it still spawns
`haus context --from-hook` (boots Node, reads config, returns) on **every user prompt** — a
latency tax for zero benefit. Product reality: **no users, no roadmap commitment**, and the
capability (task-scoped context / token reduction) could be re-sourced from a catalog
skill/agent if it ever earns a slot. The gated-off middle is strictly dominated: either
invest (make it work + ship default-on) or remove. Decision: **remove.**

Reintroduction path if it returns: a **catalog skill/agent** (first- or third-party), not
hardwired CLI+hook machinery — that is the on-model place for context assets and is cleaner
than what exists today.

## Why it's a clean cut

`src/commands/context.ts` is the **single root**. Every module below it is exclusively its
consumer (verified by grep — no other non-test importer):

```
haus context (cmd + UserPromptSubmit hook)
├── config.json gating: load-hooks-config.ts, haus config cmd, isHookEnabled
├── task-intent routing: task-intent.ts, task-classification.ts, rule-selection.ts
├── redact-sensitive.ts + secret-patterns.ts
└── renderSummary() (render.ts — function only; buildContentBlob stays)
```

The **load-bearing PreToolUse safety guards** (`haus guard file-access`, `haus guard bash`)
are untouched — only the UserPromptSubmit context hook is removed.

Net result: `settings.json` sheds `UserPromptSubmit` entirely; `.haus-workflow/` drops
`config.json` → **4 survivors** (`context-map.json`, `recommendation.json`, `haus.lock.json`,
`sources-report.json`).

---

## Highest-stakes surface: the settings/hooks contract

This is the one part that needs care (flagged highest-stakes in `workflow-config.md` —
"a bug here silently blocks catalog updates / leaks an asset").

- `src/claude/load-hooks.ts:11-13` — `ClaudeHooksSettings` type declares `UserPromptSubmit`.
  Remove the property (line 12).
- `src/claude/load-hooks.ts:28-32` — `CANONICAL_HOOKS.hooks.UserPromptSubmit` block. Remove.
  PreToolUse block (33-42) stays.
- `src/claude/verify-hooks-contract.ts:33-37` — `hausHookContractSatisfied` asserts every
  `canonical.hooks.UserPromptSubmit` command is present on disk. Once the type loses
  `UserPromptSubmit`, lines 33-37 won't typecheck → delete them. The PreToolUse loop (38-42)
  and deny loop (43-46) stay. `assertPostApplySettingsHausContract` (51-64) and
  `verifyProjectSettingsHooksContract` (72-99) delegate to the helper — no edit needed.
- `src/claude/merge-project-settings.ts:20-26` — the `'haus.context-hook'` `HookFragment`
  in `PROJECT_HOOK_FRAGMENTS`. Remove; keep `haus.guard-file` (27-33) + `haus.guard-bash` (34-40).

**Contract after change:** PreToolUse guards present + deny rules present. The new contract
must be proven by a test that asserts the guards still install and that no UserPromptSubmit
entry is written.

---

## Execution steps (single PR)

### Step 1 — Hooks contract + canonical hooks (highest-stakes; do first)

- `load-hooks.ts`: drop `UserPromptSubmit` from the type (`:12`) and from `CANONICAL_HOOKS` (`:28-32`).
- `verify-hooks-contract.ts`: delete the UserPromptSubmit assertion loop (`:33-37`).
- `merge-project-settings.ts`: remove the `haus.context-hook` fragment (`:20-26`).

### Step 2 — Remove the `haus context` command + hook consumer

- `src/commands/context.ts` — delete file.
- `src/cli.ts`: remove `runContext` import (`:11`) and the `context` command (`:84-90`).

### Step 3 — config.json machinery + `haus config`

- `src/commands/config.ts` — delete file.
- `src/claude/load-hooks-config.ts` — delete file (`isHookEnabled`, `DEFAULT_HOOKS_CONFIG`, `HookKey`).
- `src/cli.ts`: remove `runConfig` import (`:10`) and the `config` command (`:124-136`).
- `src/claude/write-claude-files.ts`: remove the `DEFAULT_HOOKS_CONFIG` import (`:18`) and the
  config.json write block (`:90-96`).
- `src/claude/managed-paths.ts`: drop `'config.json'` from `PROJECT_MANAGED_HAUS_REL` (`:11`)
  → leaves `['haus.lock.json']`.
- `src/commands/doctor.ts`: remove `isHookEnabled`/`HookKey` import (`:7`) and the per-hook
  gate-status block (`:80-86`). The hooks-**contract** check (`:66-78`) is independent — stays.
- **Migration:** add a guarded cleanup in apply to remove a legacy `config.json` (machine-generated,
  safe to delete unconditionally if present) — mirror the `selected-context.json` cleanup from #103.

### Step 4 — Task-intent routing (self-contained cluster)

- Delete `src/recommender/task-intent.ts`, `task-classification.ts`, `rule-selection.ts`.
- Confirmed: `recommend.ts` / `explain` do **not** import these. Clean.

### Step 5 — redact-sensitive

- Delete `src/security/redact-sensitive.ts` + `src/security/secret-patterns.ts` (sole importer
  was context.ts). **See Q1** — this removes a control documented in `docs/security.md:67`.

### Step 6 — renderSummary

- `src/scanner/render.ts`: delete the `renderSummary` function (`:45`) only. **Keep
  `buildContentBlob`** (`:20`) — used by `scan-project.ts:22,97`.

### Step 7 — allowlist

- `src/install/allow-rules.ts`: remove `context` from the `Bash(haus <sub>:*)` allowlist
  (the shipped allow rule `Bash(haus context:*)` is now dead).

### Step 8 — docs

- `docs/cli.md`: remove `### haus context` (`:75-81`) and the `haus config` Configuration
  section (`:107-117`).
- `README.md`: remove `haus context --task ...` (`:65`) and `haus config` (`:70`) from the
  command list.
- `docs/security.md:67`: remove/rewrite the redactor note (per Q1).

### Step 9 — tests

**Delete (test removed units):**

- `tests/hooks-gating.test.js`, `tests/task-classification.test.js`,
  `tests/rule-selection.test.js`, `tests/task-intent-budget.test.js`,
  `tests/redact-sensitive.test.js`.
- `tests/commands-cli.test.js` — the `haus context` redaction test (~`:73-104`); keep the rest.

**Update (logic that stays, context hook was just the vehicle):**

- `tests/load-hooks.test.js:11-12` — drop UserPromptSubmit assertions; keep PreToolUse.
- `tests/apply.test.js` — remove `:17` and `:43-45` (UserPromptSubmit/context); keep PreToolUse + deny.
- `tests/install.test.js:97-101,112-114` — remove the gated-fragment fixture + "skips gate-default-off" test.
- `tests/install-roundtrip.test.js:76-82` — drop the now-vacuous "gated hook not installed" block.
- `tests/settings-merge-hooks.test.js` — rewrite the example fragment from the context
  UserPromptSubmit hook to a PreToolUse guard (mergeHooks logic stays; don't delete the file).
- `tests/allow-rules.test.js:19` — remove the `Bash(haus context:*)` assertion.

**Add (prove the new contract):**

- A test asserting a fresh `apply` writes the PreToolUse guards and **no** `UserPromptSubmit`
  entry, and that `haus doctor` passes the hooks contract with guards-only.

### Acceptance criteria

- `yarn verify` green (typecheck is the safety net — the `UserPromptSubmit` type removal will
  flag every missed site).
- Fresh `apply` on a fixture: `settings.json` has PreToolUse guards + deny rules, **no
  UserPromptSubmit**; `.haus-workflow/` has exactly 4 files (no `config.json`).
- `haus doctor` green (hooks contract satisfied by guards alone).
- `haus context` and `haus config` no longer exist as commands (invoking them errors cleanly).
- Legacy `config.json` removed on apply for projects that had it.
- Recommendation output (`recommend.json`) unchanged — routing removal touches only the unused
  read side (see Q2).

### Risk notes

- **Settings contract (Step 1):** the only real-risk surface. Mitigation: do it first, lean on
  typecheck, add the guards-only contract test. The PreToolUse safety guards — the load-bearing
  half of the security story — are never touched.
- Everything else is exclusively-downstream of context and removes mechanically.

---

## Open questions (only two)

- **Q1 — `redact-sensitive` removal.** It is documented in `docs/security.md:67` as a security
  control ("strips secrets from `haus context` output"). But its **only** caller is the context
  output, which is being removed — no other path uses redaction. Recommend: **remove it** and
  drop the doc note. Confirm, or keep the module dormant for a future use?

- **Q2 — orphaned `Recommendation.recommended[]` echo fields** (`tags`, `ecosystem`,
  `tokenEstimate`, `types.ts:161-166`). After routing is gone these are written
  (`recommend.ts:211-213`) + echoed (`explain-recommendation.ts:67-69`) but **never read**.
  Harmless to leave. Recommend: **leave them** (lower risk; additive optional fields), prune
  later if desired. Confirm, or prune now for cleanliness?

> Note (not blocking): `CatalogItem.tokenEstimate`/`ecosystem` (`types.ts:80,86`) are a
> **different**, required field used broadly by the recommender — do NOT touch those.
