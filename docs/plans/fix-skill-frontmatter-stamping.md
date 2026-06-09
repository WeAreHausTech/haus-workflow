# Plan: Fix global-install header stamping that breaks skill frontmatter

> Source bug: `/haus-workflow` with no task does not present a chooseable menu in
> Claude Desktop. Root cause is broken YAML frontmatter on the globally-installed
> `haus-workflow` skill.

## Problem statement

The `haus-workflow` skill instructs the model to call `AskUserQuestion` when no task
argument is given (renders the chooseable menu). That instruction lives in the skill
**body**, below the frontmatter. Claude Code/Desktop only register a skill's metadata
and body correctly when valid YAML frontmatter starts at **line 1**.

For the globally-installed skill at `~/.claude/skills/haus-workflow/SKILL.md`, the
frontmatter is destroyed by two stacked defects, so the skill loads with a garbage
description and (in Desktop) the body fails to drive behaviour — no menu appears.

### Defect 1 — malformed source frontmatter

`library/global/skills/haus-workflow/SKILL.md` line 1:

```
## <!-- HAUS-MANAGED id=skill.haus-workflow v=2 source=@haus-tech/haus-workflow@0.1.0 -->

name: haus-workflow
description: ...
---
```

- Line 1 carries a `## ` prefix and an HTML comment — not `---`.
- There is a **closing** `---` but no **opening** `---`. This is not valid frontmatter.
- The embedded version (`v=2 @0.1.0`) is stale and hand-written.

### Defect 2 — `stampMarkdown` prepends a header above frontmatter

Global install (`src/install/apply.ts` → `stampMarkdown` in `src/install/header.ts:40`)
prepends `<!-- HAUS-MANAGED ... -->\n` to every managed file. `parseMarkdownHeader`
only matches a first line that `startsWith('<!-- HAUS-MANAGED')`; the source line 1 is
`## <!--`, so the match fails, no replace happens, and a **second** header is prepended.
Installed result:

```
<!-- HAUS-MANAGED id=skill.haus-workflow v=1 source=...@0.14.0 -->   ← install prepends
## <!-- HAUS-MANAGED id=skill.haus-workflow v=2 source=...@0.1.0 -->  ← stale source line
name: haus-workflow
description: ...
---
```

Confirmed live: the available-skills list shows `haus-workflow` (and `haus-doctor`,
`haus-fix`, `haus-setup`) with their **description set to the literal HAUS-MANAGED
comment** — proof the parser took the comment as metadata.

### The architectural conflict

An HTML comment line above YAML frontmatter is illegal frontmatter. You cannot keep a
top-line `<!-- HAUS-MANAGED -->` ownership stamp **and** valid skill frontmatter at
line 1. The two requirements collide on exactly the files that use frontmatter (skills;
commands that opt into a `description`).

### Precedent: the project path already solved this

The **recommender/apply** path that writes project skills into `.claude/skills/` copies
catalog primitives **verbatim** (no stamp) and tracks ownership via the lockfile. It is
guarded by `tests/frontmatter-integrity.test.js`, which asserts no `HAUS-MANAGED` string
appears on line 1 of any written skill/agent. Only the **global install** path
(`src/install/apply.ts`) still stamps unconditionally — and breaks the one global skill
that has frontmatter.

## Scope

In scope:

- `library/global/skills/haus-workflow/SKILL.md` (the only global skill with frontmatter).
- Global install stamping logic (`src/install/header.ts`, `src/install/apply.ts`).
- Ownership/drift detection for frontmatter files (manifest already carries the data).
- Doctor / contract checks that assume a top-line header.
- New regression test extending the frontmatter guard to the **global** install path.
- ADR recording the ownership-marking decision.

Out of scope:

- Global **commands** (`haus-doctor/fix/setup.md`) have no frontmatter; the stamped
  header is cosmetic there (filename is the command name). Leave behaviour unchanged,
  but verify the fix does not regress them.
- Catalog/project skill path — already correct; only extend its test coverage.

## Design decision (ADR required)

**Chosen: Option A — frontmatter-aware stamping.** When a source file begins with `---`,
embed the ownership marker as a field **inside** the frontmatter block instead of a
top-line HTML comment, keeping `---` on line 1.

```
---
name: haus-workflow
description: ...
haus_managed: "id=skill.haus-workflow v=1 source=@haus-tech/haus-workflow@0.16.2 hash=..."
---
```

> Reevaluated against `main` @ e7cbd07 (v0.15.0): core bug unchanged — source
> `SKILL.md` still malformed and `header.ts` still prepends above frontmatter. The
> e7cbd07 lockfile-drift work (`src/update/lockfile.ts`, `driftCount`/`drift`) is
> **project-scoped** (`haus.lock.json`), distinct from the global-install manifest
> this plan touches — no interaction. ADR slot 0006 still free.
>
> Reevaluated against `main` @ 0ca98f7 (v0.16.0): no relevant code changed since
> e7cbd07 (only catalog fixtures + release). Core bug, header logic, and ADR-0006 slot
> all unchanged. **Coordination note:** `docs/plans/test-tier1-coverage.md` Task 3 adds
> `tests/install-roundtrip.test.js` via `applyInstall`. Whichever lands second must use
> the frontmatter-marker form for the `haus-workflow` skill — if tier-1 merges first,
> Task 4/5 here update its install assertions to expect `---` on line 1 plus a real
> `name`/`description`.
>
> Reevaluated against `main` @ 521a55e (v0.16.2): **tier-1 merged** (9c30ce3). Core bug
> still fully intact — SKILL.md body was edited by 21450c8 but the malformed frontmatter
> (`## <!--`, no opening `---`) and `header.ts` are unchanged; menu/`AskUserQuestion`
> instruction still present (SKILL.md:16,:40). Coordination note now **resolved**:
> `tests/install-roundtrip.test.js` exists (temp-HOME + `applyInstall`, settings/hooks
> only — no skill-content assertions, no collision). Tasks 4 & 5 below now reuse that
> harness. ADR-0006 slot still free.

Rationale:

- Line 1 stays `---` → skill registers correctly, description is real.
- Ownership + version + hash are still machine-readable → drift detection and
  user-owned-file protection survive.
- Passes the existing `frontmatter-integrity` guard (`HAUS-MANAGED` no longer on line 1;
  guard updated to match the field form too).

Rejected alternatives:

- **Option B — copy verbatim, manifest-only ownership.** Matches the project path and is
  smaller, but loses the inline ownership signal `parseMarkdownHeader` relies on at
  `src/install/apply.ts:181` for the "refuse to overwrite user-owned file" guard; would
  need a manifest-presence fallback and weakens drift detection for hand-copied files.
- **Status quo with the `##`/comment removed but header still on top.** Still illegal —
  any comment above `---` breaks frontmatter.

Write `docs/adr/0006-ownership-marking-on-frontmatter-files.md` capturing this.

---

## Tasks

### Task 1 — ADR for ownership marking on frontmatter files

- **Source doc:** WORKFLOW.md (ADR section); this plan's "Design decision".
- **Do:** Write `docs/adr/0006-ownership-marking-on-frontmatter-files.md` (Status:
  Accepted). Context = the stamp-vs-frontmatter conflict; Decision = Option A; record
  Options B and status-quo as alternatives considered. Add the row to
  `docs/adr/README.md`.
- **Acceptance criteria:** ADR exists, follows the WORKFLOW.md template, README index
  updated.
- **Verification:** `ls docs/adr/0006-*.md` and grep `0006` in `docs/adr/README.md`.
- **Dependencies:** none.

### Task 2 — Frontmatter-aware stamp build/parse

- **Source doc:** `src/install/header.ts`; ADR-0006.
- **Do:** In `src/install/header.ts`, make `stampMarkdown`/`parseMarkdownHeader`/
  `buildMarkdownHeader` detect a leading `---` frontmatter block and read/write the
  marker as a `haus_managed:` field inside it. Plain docs (no leading `---`) keep the
  existing top-line HTML comment form. Both forms must round-trip through
  `parseMarkdownHeader` returning the same `HausHeader`.
- **Acceptance criteria:**
  - `parseMarkdownHeader` returns the correct `{stableId, schemaVersion, source}` for
    (a) a top-line comment file and (b) a frontmatter file with the `haus_managed:` field.
  - `stampMarkdown` on a frontmatter file leaves `---` on line 1 and does not duplicate
    markers on re-stamp (idempotent).
  - `stampMarkdown` on a plain doc is unchanged from today.
- **Verification:** new unit test `tests/header.test.js` (TDD — write first per
  WORKFLOW.md highest-stakes: this is managed-template ownership logic). Run `yarn test`.
- **Dependencies:** Task 1.

### Task 3 — Fix the source skill frontmatter

- **Source doc:** Claude Code skill format; Task 2 output.
- **Do:** Rewrite `library/global/skills/haus-workflow/SKILL.md` to valid frontmatter:
  `---` on line 1, real `name` + `description`, closing `---`, body below. Remove the
  hand-written stale `## <!-- HAUS-MANAGED v=2 @0.1.0 -->` line entirely — the install
  step injects the current marker via Task 2. Body (menu / AskUserQuestion instructions)
  unchanged.
- **Acceptance criteria:** File starts with `---`; `name: haus-workflow` and the real
  description are present; no `HAUS-MANAGED` text in the committed source (it is injected
  at install time).
- **Verification:** `head -6` shows valid frontmatter; `grep -c HAUS-MANAGED` on the
  source file returns 0.
- **Dependencies:** Task 2 (so the injected form is known).

### Task 4 — Ownership guard works for frontmatter files

- **Source doc:** `src/install/apply.ts:178-200`.
- **Do:** Confirm the "refuse to overwrite user-owned file" path
  (`parseMarkdownHeader(currentContent) !== undefined`) now succeeds for a
  frontmatter-stamped skill (marker is found inside frontmatter). Adjust the read at
  `apply.ts:181` only if the new parse form needs it.
- **Acceptance criteria:** Re-running install on an unmodified installed skill is a
  no-op (skipped, hashes match); a user-edited skill is detected and skipped without
  `--force`; `--force` overwrites.
- **Verification:** add a frontmatter-skill case to the tier-1 harness
  `tests/install-roundtrip.test.js` (temp-HOME + `applyInstall`, already merged) — or a
  sibling file reusing its `mkdtempSync` + `process.env.HOME` stub pattern: install →
  re-install no-op → edit body → re-install skips → `--force` overwrites.
- **Dependencies:** Tasks 2, 3.

### Task 5 — Extend the frontmatter-integrity guard to global install

- **Source doc:** `tests/frontmatter-integrity.test.js`.
- **Do:** Add a test (reuse the merged `tests/install-roundtrip.test.js` temp-HOME +
  `applyInstall` harness) that runs the global install path and asserts every installed
  `skills/*/SKILL.md`:
  1. has `---` on line 1, and
  2. exposes a real `name` and a `description` that is NOT the HAUS-MANAGED string.
     This is the regression that had no coverage.
- **Acceptance criteria:** New test fails against the current (broken) code and passes
  after Tasks 2–3.
- **Verification:** `yarn test`; demonstrate red→green (run new test on current `main`
  first to prove it catches the bug).
- **Dependencies:** Tasks 2, 3.

### Task 6 — Doctor / contract checks

- **Source doc:** `src/commands/doctor.ts`, `tests/contract-invariants.test.js`,
  `scripts/` audit scripts run in `prepack`.
- **Do:** Audit doctor and any contract/manifest checks for assumptions that the marker
  is a top-line HTML comment. Update to accept the frontmatter-field form. If a
  manifest-drift script hashes installed files, confirm hashing still matches after the
  new stamp form. Also confirm no interaction with the v0.15.0 lockfile drift
  (`src/update/lockfile.ts`) — it is project-scoped, but verify `haus update --check`
  stays clean after a global skill reshape.
- **Acceptance criteria:** `haus doctor` reports no false drift on a freshly installed
  skill; contract tests green.
- **Verification:** `yarn test`; run `haus install` then `haus doctor` against a temp
  claude dir → clean verdict.
- **Dependencies:** Tasks 2–5.

### Task 7 — Manual Desktop repro (confirm the user-reported symptom)

- **Source doc:** original bug report.
- **Do:** After build+install, in Claude Desktop run `/haus-workflow` with no task and
  confirm the chooseable `AskUserQuestion` menu now appears. If it still does not, the
  client may not render `AskUserQuestion` — capture that finding for a follow-up (and a
  runbook entry), since the frontmatter fix alone would then be necessary-but-not-
  sufficient.
- **Acceptance criteria:** Menu appears in Desktop, OR a documented finding that the
  remaining gap is client-side rendering.
- **Verification:** manual; record outcome in `docs/runbook.md` if a non-obvious failure.
- **Dependencies:** Tasks 2–6 merged/installed.

---

## Verification gate (whole feature)

- `yarn verify` (typecheck + lint + build + test + prepack) green.
- `tests/frontmatter-integrity.test.js` covers both project and global paths.
- Manual Desktop check (Task 7) recorded.

## Risk notes

- **Highest-stakes:** `managed-template` / header logic is flagged highest-stakes in
  `workflow-config.md` (a bug silently blocks catalog updates). Tasks 2 and 4 are
  TDD-only — write tests from this spec before implementation.
- Re-stamp idempotency is the main trap: a second install must not duplicate the
  `haus_managed:` field or push frontmatter off line 1.
- Confirm no other global skills exist (today only `haus-workflow` has frontmatter); if
  more are added later, the frontmatter-integrity guard (Task 5) catches regressions.
