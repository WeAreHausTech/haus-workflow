# Plan: Prune shipped warnings, guided questions, `.haus-workflow/` outputs, and rules

> Status: **EXECUTED on branch `refactor/prune-shipped-outputs`.** All 4 steps done;
> `yarn verify` green (490 tests, +3 new migration tests). Awaiting code review + merge decision.
> Source request: prune evaluation across 6 targets (warnings, guided questions,
> `.haus-workflow/` overload, shipped security rule, shipped haus rule).
> Reference docs: `.claude/WORKFLOW.md`, `.claude/workflow-config.md`.

## TL;DR recommendation

| #   | Target                                                                    | Verdict                                           | Confidence                      |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| 1   | `.env.example` warning + `Missing env template` securityRisk              | **Remove both**                                   | High                            |
| 2   | `test` script warning                                                     | **Remove**                                        | High                            |
| 3   | Guided questions (`mode` enum, flags, prompt steps, `setup-answers.json`) | **Remove fully**                                  | High                            |
| 4   | `.haus-workflow/` overload (5 readerless JSON + `repo-summary.md`)        | **Remove 5 JSON; demote `repo-summary.md`**       | High on JSON, Medium on summary |
| 5   | Shipped `security.md` rule                                                | **Keep, but fold into `haus.md`** (or keep as-is) | Needs user decision             |
| 6   | Shipped `haus.md` rule                                                    | **Upgrade content**                               | Needs user decision             |

**Highest-stakes caveat (from `workflow-config.md`):** recommender eligibility is
flagged highest-stakes. Items 1, 2, and 3 all touch recommender inputs. Each must
ship with a before/after recommendation snapshot test on the fixtures, not just a
type change. Details under each item.

---

## Item 1 — `.env.example` warning

### Findings

- `src/scanner/scan-project.ts:122` pushes `"No .env.example found"` → `warnings[]`.
- `src/scanner/scan-project.ts:133` pushes `"Missing env template"` → `securityRisks[]`
  on the **same** missing-`.env.example` condition. So one absent file fires **two**
  signals through two pipelines.
- Both surface as `- WARN:` lines in `haus doctor` and `setup` output, and the
  securityRisk also becomes a `"Scan reported security signals: …"` line via
  `mergeRecommendationWarnings` (`src/recommender/policies.ts:76`).

### Why prune

A missing `.env.example` is not a defect. Plenty of healthy repos ship none (libraries,
CLIs — including this one). The warning fires on the common case and trains users to
ignore `WARN:` output. The duplicate securityRisk is worse: it reframes a stylistic
preference as a security problem.

### Recommendation

Remove both `scan-project.ts:122` and `scan-project.ts:133`. `.env.example` should
stay in `SAFE_FILES` (line 69) — that is unrelated (it controls what may be scanned).

### Dependency / risk

`warnings[]` feeds `config-signal-match` (`recommend.ts:180-183`): a catalog item whose
tag is a substring of the joined warnings text gets recommended. `"No .env.example found"`
contributes the tokens `env`, `example`, `found`. **Open question Q1** covers verifying
no catalog item relies on these.

### Verification

- `yarn test` green.
- Snapshot `haus recommend` output on all `tests/fixtures` repos before/after — recommended
  set must be identical (or the diff explained and accepted).
- Update `tests/recommender-policies.test.js` if any case asserts on `securityRisks` flow.

---

## Item 2 — `test` script warning

### Findings

- `src/scanner/scan-project.ts:123-124` pushes `"No package.json test script found"` when
  `pkg.scripts.test` is missing/empty.

### Why prune

haus already derives the test command independently for `workflow-config.md`
(`derive-workflow-config`), and PHP/other-stack projects legitimately have no
`package.json` test script. The warning is npm-centric noise.

### Recommendation

Remove `scan-project.ts:123-124`.

### Dependency / risk

Same `config-signal-match` path. This warning contributes the high-frequency tokens
`test`, `script`, `package`, `json` — **more likely than Item 1 to be matched by a real
catalog tag** (e.g. a testing skill tagged `test`). Verify under **Q1** before removing.
If a catalog item genuinely should match on "project has no tests", that signal should be
re-expressed as a structured field, not scraped from a prose warning string.

### Verification

Same before/after recommendation snapshot as Item 1.

---

## Item 3 — Guided questions (remove, not a feature anymore)

### Findings — two separate things wear the "guided" name

**A. Vestigial `mode: 'guided' | 'fast'` enum (dead — branches nowhere):**

- `src/cli.ts:159-160` — `--fast` / `--guided` flags on `workspace setup`.
- `src/commands/workspace.ts:35,140` — flag → `mode`.
- `src/commands/workspace/setup.ts:39,94,127`, `src/commands/setup-core.ts:31`,
  `src/commands/scan.ts:8,10` — plumbing.
- `src/scanner/scan-project.ts:97,102,143` — stored into `ContextMap.mode`, **no branch reads it**.
- `src/types.ts:16,155` — field on `ContextMap` and `Recommendation`.
- `src/recommender/explain-recommendation.ts:84`, `recommend.ts:235` — copies `mode` through.
- `tests/recommend-eligibility.test.js:34` — fixture sets `mode: 'guided'`.

**B. The actual "ask questions" behavior — pure prompt text, no code:**

- `library/global/commands/haus-setup.md:14-19` — steps 2 ("Ask the guided questions as
  chat") and 3 ("write `.haus-workflow/setup-answers.json`").
- `library/global/skills/haus-workflow/SKILL.md:77` — "asks the guided questions".
- `docs/cli.md:16,20,181` — documents `setup-project --guided`/`--fast` flags **that do not
  exist on `setup-project`** (already stale/wrong).
- `README.md:23` — "asks a few plain-language questions".
- `docs/plans/setup-deep-docs-loop.md` — historical design doc (leave as history).
- `CHANGELOG.md:284` — historical entry (leave).

**C. The consumer:** `recommend.ts:39-40,75` reads `setup-answers.json` into
`goals`, which drives `goal-match`. Nothing in code ever _writes_ `setup-answers.json`
— only the agent did, per the prompt. With guided questions gone, `goals` is always
empty and `goal-match` never fires.

### Recommendation

Full removal, in three coordinated edits:

1. **Code:** drop the `mode` enum end-to-end — flags (`cli.ts`), plumbing
   (`workspace.ts`, `workspace/setup.ts`, `setup-core.ts`, `scan.ts`), the param on
   `scanProject`, the `ContextMap.mode` / `Recommendation.mode` fields (`types.ts`),
   the copies in `explain-recommendation.ts` / `recommend.ts:235`, and fix the
   `recommend-eligibility.test.js:34` fixture. **Keep** `src/utils/prompts.ts` — its
   `confirm()` is still used by `setup-project.ts` and `undo.ts`.
2. **Prompts:** delete steps 2-3 from `haus-setup.md` (renumber 4→2 … 8→6); drop "asks
   the guided questions" from `SKILL.md:77`; remove the stale flags from `docs/cli.md`;
   soften `README.md:23`.
3. **Recommender:** remove the `setup-answers.json` read and the `goals`/`goal-match`
   code path (`recommend.ts:39-40,75` + the goal-match block) — **see Q2**, it may be
   worth keeping the read as an optional hook for a future re-introduction.

### Dependency / risk

- Removing `mode` is mechanical and safe — confirmed nothing branches on it.
- Removing `goal-match` changes recommendations **only if** any fixture currently ships
  a `setup-answers.json`. Grep confirms none in `tests/fixtures`, so live impact is nil,
  but snapshot anyway.

### Verification

- `yarn verify` (typecheck catches every missed `mode` reference — this is the safety net).
- Before/after recommendation snapshot on fixtures (should be identical).
- `haus setup-project --json` still runs; `haus-setup.md` flow reads coherently end-to-end.

---

## Item 4 — `.haus-workflow/` overload

`haus` writes up to **11 files** into a single repo's `.haus-workflow/` (13+ in workspace
mode). Five JSON artifacts have **no reader anywhere in the codebase**.

### Keep (load-bearing — drive logic)

| File                  | Why keep                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| `context-map.json`    | Central scan artifact; read by recommend, doctor, context, config writer. |
| `recommendation.json` | Drives what `apply` installs; read by 6 consumers.                        |
| `haus.lock.json`      | The tamper/drift/update ledger (only file with `hash`). Highest-stakes.   |
| `config.json`         | Hook opt-in state; preserved across applies.                              |
| `sources-report.json` | Gates curated catalog items in recommender.                               |

### Remove (readerless — confirmed no in-repo consumer)

| File                     | Written at                            | Why removable                                                                                                               |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dependency-map.json`    | `scan-project.ts:174`                 | Pure subset of `context-map.json.dependencies`, reshaped. No reader.                                                        |
| `scan-hashes.json`       | `scan-project.ts:175`                 | Docstring claims "drift detection" but nothing reads it. Dead. Also the most expensive artifact (hashes every source file). |
| `recommended-hooks.json` | `recommend.ts:16`, `setup-core.ts:69` | Flat hook-id list, derivable from `recommendation.json`. No reader.                                                         |
| `recommended-rules.json` | `recommend.ts:17`, `setup-core.ts:70` | Two hardcoded rule ids. No reader.                                                                                          |
| `selected-context.json`  | `write-claude-files.ts:265`           | Subset of `haus.lock.json` minus hashes. Undo-tracks it but never reads it back as logic. **See Q3** (undo provenance).     |

Removing `scan-hashes.json` also drops the per-file hashing loop in `scan-project.ts:165-170`
— a real scan-time win on large repos.

### `repo-summary.md` — demote

- Written at `scan-project.ts:176` via `renderSummary`. **Only reader** is `haus context`
  (`context.ts:34`) — the optional context hook, **default OFF** (`DEFAULT_HOOKS_CONFIG`).
- Rendered purely from `context-map.json`, so it carries zero new information.
- The `writing-documentation` skill (installed in `haus-setup.md` step 4, run on every
  setup) now produces the real human docs. `repo-summary.md` is duplicative auto-prose.
- **Recommendation:** stop writing `repo-summary.md`; if the `context` hook still needs a
  human view, render it on demand from `context-map.json` inside `context.ts`. **See Q4.**

### Recommendation

Stop writing the 5 readerless JSON files + `repo-summary.md`. Net result in a target
project's `.haus-workflow/`: from 11 files down to **5** (context-map, recommendation,
haus.lock, config, sources-report) plus the externally-authored `deep-context.json`.
Do **not** merge any of the 5 survivors — each has a distinct role and reader; combining
them would entangle the tamper-detection ledger with mutable scan output.

### Dependency / risk

- `undo` tracks `selected-context.json` as a written path — removing it must also drop it
  from the undo manifest, or undo will warn about a missing file (**Q3**).
- The `ScanResult` return type currently includes `dependencyMap`, `scanHashes`,
  `repoSummary`. If callers destructure these, the type change ripples — typecheck will
  catch it.

### Verification

- `yarn verify`.
- Run `haus setup-project` on a fixture, list `.haus-workflow/` — exactly the 5 expected
  files (+ any agent-authored ones).
- `haus doctor` + `haus update` + `haus undo` all green against the new file set.

---

## Item 5 — Shipped `security.md` rule

### Findings

Written inline at `write-claude-files.ts:140-145` → `.claude/rules/security.md`:

```
- Never read secrets.
- Block dangerous shell commands.
```

The deterministic enforcement (settings.json `deny`/`ask`/`allow`) is built from
`src/security/{deny,ask}-rules.ts` + `dangerous-commands.ts` + `sensitive-paths.ts`, plus
runtime `haus guard` hooks fed by the same lists. So there are **three** layers; the
markdown rule is the thinnest.

### Assessment

The user's instinct ("overflow") is half right. The rule **conceptually duplicates** the
deny/ask layer — but it duplicates _intent_, not _specifics_ (it names no commands/paths,
so there's no drift risk). `WORKFLOW.md` ("Settings: deterministic enforcement") explicitly
mandates critical rules live in **both** the advisory layer (CLAUDE.md/rules, which the
model reads) and the deterministic layer (settings.json, enforced pre-call). Deleting
`security.md` outright technically violates the project's own standard.

### Recommendation (needs user decision — Q5)

Two defensible paths:

- **(a) Fold into `haus.md`** — append the two security lines to the shipped `haus.md`
  rule so the advisory contract is still met but one fewer file ships. Net: 1 file instead
  of 2, contract preserved. _(Recommended.)_
- **(b) Keep as-is** — it costs 2 lines, satisfies the contract verbatim, zero risk.

Do **not** delete it entirely without also amending the WORKFLOW.md "both layers" rule —
otherwise the shipped standard contradicts the shipped output.

---

## Item 6 — Shipped `haus.md` rule (update / upgrade)

### Findings

Written inline at `write-claude-files.ts:127-139` → `.claude/rules/haus.md`:

```
- Keep context minimal.
- Follow project conventions.

## Driving haus
When the user asks to set up, configure, check, or fix the project, run
`haus setup-project` or `haus doctor` and narrate results in plain language — never
make them use a terminal or read JSON. The `/haus-setup`, `/haus-doctor`, and
`/haus-fix` commands do the same.
```

### Assessment

**Not stale** — every command and slash-command it names exists in v0.23.1; no reference
to the removed `haus-review`. But it is thin and could be upgraded.

### Recommendation (needs user decision — Q6)

Candidate upgrades (pick a subset):

- Mention `/haus-workflow` (the all-in-one entry skill) and `project:refresh` /
  `update` tasks, so the agent knows the catalog/update path, not just setup/doctor.
- Add a one-liner that the agent should never hand-edit haus-managed blocks
  (`<!-- HAUS:BEGIN … -->`) — a real failure mode worth a deterministic nudge.
- State the _why_ (per WORKFLOW.md "state the reason"): "haus owns `.claude/` and
  `.haus-workflow/` — regenerate via `haus apply`, don't hand-edit managed files."

Keep it short — this rule loads every session.

---

## Resolved decisions

- **Q1 (Items 1 & 2) — RESOLVED, safe to remove.** `config-signal-match` fires when a catalog
  item's **tag** is a substring of the joined warnings text
  `"no .env.example found no package.json test script found"`. Checked all 68 catalog items
  (79 unique tags): **zero tags match.** Closest tags (`testing`, `typescript`, `vitest`,
  `testing-library`) match on deps/roles, not these warnings. Removing both warnings changes
  **no** recommendations. Fixture snapshot in execution is a formality but still run it.

- **Q2 (Item 3) — KILL the `goal-match` path.** Code never writes `setup-answers.json`, so
  `goals` (`recommend.ts:75`) is always empty and `goal-match` (`recommend.ts:162-165`) never
  fires in practice. Dead code. Remove `recommend.ts:39-40` (read), `:75` (goals), `:162-165`
  (goalMatch find + push). _No keep-justification needed — confirmed unused._

- **Q3 (Item 4) — RESOLVED, both confirmed dead by code trace:**
  - `selected-context.json` is **written only**, content **never read**. Undo removes by path
    (seeded from `coreManagedAbsolutePaths` + `haus.lock.json` `row.paths`,
    `undo.ts:23-36,128-132`) — never reads selected-context. Uninstall is global-only
    (`~/.claude/`), never touches it. To drop: remove the write block
    (`write-claude-files.ts:265-275`) **and** the `'selected-context.json'` entry in
    `PROJECT_MANAGED_HAUS_REL` (`managed-paths.ts:16`). Nothing else breaks.
  - `scan-hashes.json` is **written only** (`scan-project.ts:165-170,175`), the returned
    `scanHashes` field is **never consumed**. Update/refresh hash live from
    `haus.lock.json` paths (`lockfile.ts:53-60,86-93`), not scan-hashes. Safe to remove the
    write, the hashing loop, and the `scanHashes` type field.

- **Q4 (Item 4) — STOP writing `repo-summary.md` and remove if unneeded.** Only reader is the
  default-OFF `context` hook (`context.ts:34`); content is 100% derivable from
  `context-map.json`; `writing-documentation` skill now produces the real docs on setup.
  Stop writing it (`scan-project.ts:176`) and have `haus context` render on demand from
  `context-map.json` (move `renderSummary` into `context.ts`). Drop `repoSummary` from
  `ScanResult`.

- **Q5 (Item 5) — FOLD `security.md` into `haus.md`.** Append the two security lines to the
  shipped `haus.md` rule; stop writing `.claude/rules/security.md`; remove it from core files
  (`write-claude-files.ts:69`) and from managed paths so `doctor`/`undo` don't expect it.
  **Migration:** existing projects have a `security.md` on disk — `apply` must delete the
  managed `security.md` when its content byte-matches the shipped stub (same guarded-delete
  pattern already used for the legacy `haus-review.md`, `write-claude-files.ts:110-126`).

- **Q6 (Item 6) — UPGRADE `haus.md` approved.** New content (final, includes folded security
  lines from Q5):

  ```
  - Keep context minimal.
  - Follow project conventions.
  - Never read secrets.
  - Block dangerous shell commands.
  - NEVER hand-edit haus-managed blocks (`<!-- HAUS:BEGIN … -->` … `<!-- HAUS:END … -->`)
    or files under `.claude/`/`.haus-workflow/` that haus owns — regenerate via `haus apply`.
    Hand-edits are silently overwritten or flagged as drift.

  ## Driving haus
  haus owns `.claude/` and `.haus-workflow/`. When the user asks to set up, configure, check,
  fix, refresh, or update the project, run the matching `haus` command and narrate results in
  plain language — never make them use a terminal or read JSON.
  - Set up / configure / fix / check → `haus setup-project`, `haus apply --write`, `haus doctor`
  - Update package + catalog → `haus update`
  - The `/haus-workflow`, `/haus-setup`, `/haus-doctor`, and `/haus-fix` commands do the same.
  ```

  _(Exact wording tunable during execution; intent locked.)_

- **Q7 — ONE PR.** All items ship together: `refactor/prune-shipped-outputs`.

---

## Execution — single PR `refactor/prune-shipped-outputs`

> One branch, one PR. Work the steps in order (later steps depend on earlier type changes).
> Per WORKFLOW.md §3 this requires explicit "go" before any code edit. Plan approval grants
> blanket exec authority for this scope only.

**Step 1 — Scan warnings (Items 1, 2).** Remove `scan-project.ts:122` (`No .env.example
found`), `:123-124` (`No package.json test script found`), `:133` (`Missing env template`).

**Step 2 — Guided questions (Item 3).** Drop `mode` enum end-to-end: flags
(`cli.ts:159-160`), plumbing (`workspace.ts:35,140`, `workspace/setup.ts:39,94,127`,
`setup-core.ts:31`, `scan.ts:8,10`), `scanProject` param (`scan-project.ts:97,102,143`),
`ContextMap.mode`/`Recommendation.mode` (`types.ts:16,155`), copies
(`explain-recommendation.ts:84`, `recommend.ts:235`), fixture
(`recommend-eligibility.test.js:34`). Remove `goal-match` (`recommend.ts:39-40,75,162-165`).
**Keep `src/utils/prompts.ts`** (`confirm()` still used). Prompts/docs: delete steps 2-3 from
`haus-setup.md` (renumber 4→2…8→6), drop "asks the guided questions" from `SKILL.md:77`,
remove `--guided`/`--fast` from `docs/cli.md:16,20,181`, soften `README.md:23`.

**Step 3 — Slim outputs (Item 4).** Stop writing `dependency-map.json`, `scan-hashes.json`,
`recommended-hooks.json`, `recommended-rules.json`, `selected-context.json`, `repo-summary.md`.
Remove the hashing loop (`scan-project.ts:165-170`), `selected-context` write
(`write-claude-files.ts:265-275`), readerless writes in `recommend.ts:16-17` /
`setup-core.ts:69-70`. Update `ScanResult` (drop `dependencyMap`, `scanHashes`, `repoSummary`).
Remove `'selected-context.json'` from `managed-paths.ts:16`. Move `renderSummary` into
`context.ts` for on-demand render.

**Step 4 — Rules (Items 5, 6).** Replace `haus.md` content (Q6 block, includes security
lines). Stop writing `security.md`; remove from core files (`write-claude-files.ts:69`) +
managed paths; add guarded-delete migration for existing `security.md`.

### Acceptance criteria

- `yarn verify` green (typecheck is the safety net for the `mode`/`ScanResult` removals).
- `haus setup-project` on a fixture yields exactly these `.haus-workflow/` files:
  `context-map.json`, `recommendation.json`, `haus.lock.json`, `config.json`,
  `sources-report.json` (+ any agent-authored `deep-context.json`).
- Before/after `haus recommend` snapshot on all fixtures: **identical** recommended set.
- `.claude/rules/` contains only `haus.md` (no `security.md`); content matches Q6 block.
- `haus doctor` reports no drift after a fresh `apply`; `haus undo` + `haus update` green.
- New/updated tests cover: rule content, the guarded `security.md` deletion, and the slimmed
  output file set.

### Risk notes

- **Highest-stakes (workflow-config.md):** recommender eligibility + managed-template hash
  logic. Item 1/2/3 touch recommender inputs (Q1 proves no eligibility change — still
  snapshot). Rule changes touch managed-template hashing — the guarded-delete + new hash must
  pass tamper detection; add a test that an unmodified shipped `security.md` is removed but a
  user-edited one is preserved.
