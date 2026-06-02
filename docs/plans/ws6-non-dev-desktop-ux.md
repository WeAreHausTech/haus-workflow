# WS6 — Non-developer desktop UX

> Source: `docs/plans/system-audit-remediation.md` §A.10 / Part B WS6. One branch → one PR → merge before WS5.
> Deps met: WS1 (`settings-merge.ts`), WS3 (`detectionStatus`) both merged.
> Locked decisions: **project-rule-only NL trigger** (no `~/.claude/CLAUDE.md` edit); **answers via `.haus-workflow/setup-answers.json`** (reuse existing file).

## Goal

A non-developer in Claude Code desktop reaches "configured + healthy" through chat alone — no terminal, no JSON, ≤1 approval prompt — ending in a plain-language confirmation. The agent runs every `haus` command; the human reads plain language and clicks Approve.

## Mental model (governs every task)

Human lives in the chat pane. Levers: global slash commands (`~/.claude/commands/*.md`), `permissions.allow`/`deny` in `settings.json`, the managed project rule (`.claude/rules/haus.md`), and PreToolUse guards. Each task optimizes that loop.

---

## Tasks

### T1 — Global slash commands seeded by install

**What:** Ship `library/global/commands/haus-setup.md`, `haus-doctor.md`, `haus-fix.md`. Extend `collectSourceFiles` (`src/install/apply.ts:86-104`) to also walk `library/global/commands/` and copy **flat** `*.md` → `~/.claude/commands/*.md` (CC discovers commands flat — §A.11). New `command.*` stableId namespace; reuse existing hash-stamp / manifest-track / skip-overwrite / orphan-cleanup guards (same code path as `skill.*`).

- `haus-setup.md`: instruct agent → run `haus setup-project --fast --json`, translate detection to plain language, ask guided questions as chat, write `.haus-workflow/setup-answers.json`, run `haus apply --write`, finish with doctor verdict.
- `haus-doctor.md`: run `haus doctor`, narrate the verdict line in plain language.
- `haus-fix.md`: run `haus doctor`, then apply each suggested fix command.

**Acceptance:** after `haus install`, `~/.claude/commands/{haus-setup,haus-doctor,haus-fix}.md` exist, flat, frontmatter at line 1, tracked in the install manifest under `command.*`; re-install idempotent; `haus uninstall` removes them.
**Verify:** `tests/commands-install.test.js` (new/extended) — assert 3 command files copied + manifested; `yarn test`.
**Source:** §A.10 step 1, WS6(a).

### T2 — Scoped `permissions.allow`

**What:** Mirror WS1's deny machinery in `src/install/settings-merge.ts`: add `_haus.allowRules?: string[]`, `mergeAllowRules(settings, rules)` and `stripHausAllow(settings)` (same keep-only-what-haus-added / preserve-user-entries discipline as `mergeDenyRules`/`stripHausDeny`). Call from `apply.ts` after `mergeDenyRules`. Allow list (scoped, not blanket `Bash(haus:*)`):
`Bash(haus setup-project:*)`, `Bash(haus apply:*)`, `Bash(haus doctor:*)`, `Bash(haus scan:*)`, `Bash(haus context:*)`, `Bash(haus recommend:*)`.

**Acceptance:** generated `settings.json` has `permissions.allow` with the 6 scoped entries under `_haus.allowRules`; an unknown `haus` subcommand still prompts; `stripHausAllow` removes only haus-added entries, preserves user allows.
**Verify:** extend `tests/deny-rules.test.js` (or new `tests/allow-rules.test.js`) — merge/strip round-trip + user-entry preservation; `yarn test`.
**Source:** §A.10 step 3, WS6(d). Skeptical point: scoped, not blanket.

### T3 — "Driving haus" rule block (project rule only)

**What:** Append to the managed `.claude/rules/haus.md` content (`src/claude/write-claude-files.ts:105`) a short block: *"When the user asks to set up / configure / health-check / fix the project, run `haus setup-project` / `haus doctor` and narrate the results in plain language."* **No edit to `~/.claude/CLAUDE.md`** (locked decision) — global discovery is the slash commands; this rule is the per-project NL fallback.

**Acceptance:** `.claude/rules/haus.md` contains the Driving-haus guidance after `apply --write`.
**Verify:** assertion in `tests/apply.test.js` (rule content includes the trigger sentence); `yarn test`.
**Source:** §A.10 step 1 (NL trigger), WS6(b). Skeptical point: NL trigger depends on rule being in context — slash command is the reliable fallback (T1).

### T4 — Conversational setup (agent-supplied answers)

**What:** `src/commands/setup-project.ts` — after loading existing `.haus-workflow/setup-answers.json` (line 43-44), use already-present answers to skip the readline `ask()` for that question (line 51), so an agent that pre-wrote the file drives setup without prompts. Keep the inquirer/readline path for TTY users with blank answers. No second channel (env var rejected per decision). The `--json` path already bypasses prompts.

**Acceptance:** with `.haus-workflow/setup-answers.json` fully pre-filled, non-`--json` `setup-project --guided` writes files without issuing any readline prompt; partially-filled → prompts only for blanks; TTY path unchanged.
**Verify:** `tests/setup-project.test.js` extended — pre-seed answers file, run guided non-TTY, assert no prompt / answers consumed; `yarn test`.
**Source:** §A.10 step 2, WS6(c).

### T5 — Plain-language role labels + summary

**What:** New `src/scanner/role-labels.ts`: `friendlyRole(role: string): string` map for known roles (`vendure-plugin` → "a Vendure plugin", `nextjs-app` → "a Next.js app", …) with a humanized fallback for unknowns. Use it in `renderSummary` (`src/scanner/scan-project.ts:314-323`) → a plain-language paragraph that also surfaces `detectionStatus` ("I couldn't fully recognise this stack" on `unknown`). Roles enumerated from `detection-registry.ts` ROLE_RULES.

**Acceptance:** `repo-summary.md` renders friendly role prose + an honest line when `detectionStatus !== supported`.
**Verify:** `tests/role-labels.test.js` (map + fallback) + summary-shape assertion; `yarn test`.
**Source:** §A.10 step 4, WS6(e). Depends on WS3 `detectionStatus` (merged).

### T6 — Doctor verdict line + import-bridge check

**What:** `src/commands/doctor.ts`:
- (a) Collect each check as `{severity, message, fixCmd}`; emit ONE top verdict line: "✅ Your project is set up and healthy" / "⚠️ N things need attention", then map each WARN/FAIL to a sentence + exact fix command. Keep detailed output beneath (devs).
- (b) Expand the existing import-block check (L76-81): after confirming `BLOCK_BEGIN` present, parse each `@.haus-workflow/*` line and verify the target resolves; warn per missing target. Markers from `write-root-claude-md.ts` (`BLOCK_BEGIN`/`BLOCK_END`, 3 imports).

**Acceptance:** doctor prints a single green/amber verdict line first; a missing `@.haus-workflow/*` target produces a specific warn; healthy repo → green line.
**Verify:** `tests/doctor.test.js` extended — verdict line on healthy + on injected WARN; import-bridge warn when a target file is deleted; `yarn test`.
**Source:** §A.10 step 4 + WS9 import-bridge fold, WS6(f).

### T7 — Plain-language guard deny messages

**What:** Rewrite deny strings keeping WHAT was blocked (security clarity first):
- `src/security/guard-bash.ts:12` `Blocked dangerous command: ${command}` → "I didn't run that — it can permanently change or delete files (`${command}`)."
- `src/security/guard-file-access.ts:12` `Blocked sensitive path: ${candidate}` → "I didn't open `${candidate}` — it looks like it holds secrets or sensitive data."

**Acceptance:** guards still deny the same inputs; messages are plain sentences that still name the command/path.
**Verify:** `tests/guard.test.js` extended — assert deny + new message substrings; `yarn test`.
**Source:** §A.10 step 4 (guard messages), WS6(e). Skeptical point: brevity must not hide what was blocked.

### T8 — De-jargon generated file headers + done signal

**What:**
- `src/claude/write-project-facts.ts:60-62` (`# Project facts` …) and `src/claude/write-workflow-config.ts:65-70` (`# Project workflow configuration` …) — friendlier titles/intros for a non-dev who opens them, keeping the managed/edit-freely semantics.
- Done signal: the `haus-setup.md` command (T1) ends with one chat line — "✅ Your project is configured — I added N guardrails and M coding helpers. Run `/haus-doctor` any time to re-check." (Content lives in the command markdown, not code; counts narrated by the agent from apply output.)

**Acceptance:** headers read in plain language; setup command instructs the closing confirmation line.
**Verify:** header-string assertions in existing write tests; `yarn test`.
**Source:** §A.10 step 4 (f), WS6(f).

---

## Verification gate (whole WS)

- Per-task tests above + `yarn verify` (typecheck + typecheck:scripts + lint + build + test) green.
- Manual: `npm pack` → global install in throwaway HOME → assert `~/.claude/commands/*` present; `yarn dev setup-project --fast --json` on a fixture → plain narration; `yarn dev doctor` → single verdict line.
- Adversarial fresh-context review before commit; address Copilot; `Co-Authored-By: Claude Opus 4.8`.

## Out of scope

No new pattern skills / review agents (Part E). Command markdown + the role-label map are config/docs/code — in scope. No global `~/.claude/CLAUDE.md` edit (locked).

## Task order (sequential, shared files)

T2 + T1 both touch `apply.ts` → do T2 (settings-merge) then T1 (collectSourceFiles). T5 before T6 (doctor may reuse friendly labels). Rest independent. Suggested: T2 → T1 → T3 → T4 → T5 → T6 → T7 → T8.
