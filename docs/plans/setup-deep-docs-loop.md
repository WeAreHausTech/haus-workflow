# Auto deep-docs loop in setup — Implementation Plan

> **For agentic workers:** use the subagent-driven-development or executing-plans skill to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/haus-setup` run the deep-documentation pass automatically — write docs **and**
pick up docs-informed skills in a single setup run, with no manual follow-up.

**Architecture:** The data plumbing already exists (scanner → `context-map.json`; the
`writing-documentation` skill → docs + `deep-context.json`; the recommender's two-pass, add-only
enrichment reads `deep-context.json`). The only thing missing is orchestration. This plan rewrites
**one file** — the `/haus-setup` command prompt — to chain the steps, plus a guard test and a
manual end-to-end check. No recommender, CLI, or scanner code changes.

**Tech stack:** Markdown command prompt (`library/global/commands/haus-setup.md`), Node test
runner (`tests/*.test.js`), the existing `haus` CLI (`scan`/`recommend`/`apply`).

---

## Locked decisions (from brainstorming, 2026-06-05)

- **Layered, add-only.** Deterministic recommender stays the floor; the deep scan can only make
  *more* skills eligible, never drop a gated asset. Already built — `recommend.ts` two-pass.
- **Skill stays in the catalog, read inline.** `writing-documentation` is NOT promoted to a
  global skill. After the first apply installs it, the `/haus-setup` orchestrator reads the
  installed `SKILL.md` and follows it inline. Scoped footprint, no session-reload risk.
- **Orchestration only.** The single behavioural change is the `/haus-setup` command prompt.

## What we confirmed already exists (do NOT rebuild)

- Recommender two-pass enrichment + determinism + malformed-input safety — covered by
  [tests/deep-context-enrichment.test.js](../../tests/deep-context-enrichment.test.js).
- `haus-setup.md` copied flat + manifested as `command.haus-setup` — covered by
  [tests/install.test.js:262](../../tests/install.test.js).
- The docs skill is a `default: true` catalog item, so the **first** `haus apply --write`
  installs it ([library/catalog/manifest.json](../../library/catalog/manifest.json), id
  `haus.writing-documentation`).
- Catalog skills are copied to `.claude/skills/<basename>/` — the `haus-owned/general/` nesting is
  flattened to the basename ([src/claude/write-claude-files.ts:179](../../src/claude/write-claude-files.ts)).
  So the docs skill lands at **`.claude/skills/writing-documentation/SKILL.md`**.

## Target flow (the new `/haus-setup`)

| # | Step | Command / action | Notes |
|---|------|------------------|-------|
| 1 | Detect | `haus setup-project --fast --json` | scan + shallow recommend; writes `context-map.json` |
| 2 | Guided Q&A | ask in chat → write `setup-answers.json` | unchanged |
| 3 | First apply | `haus apply --write` | installs base assets **+ the docs skill** |
| 4 | Deep scan (new) | read `.claude/skills/writing-documentation/SKILL.md`, follow inline | writes docs (around the `HAUS:BEGIN/END` block) + `deep-context.json` |
| 5 | Re-recommend (new) | `haus recommend` | two-pass picks up `deep-context.json` |
| 6 | Second apply | `haus apply --write` | diff-first — only the newly-eligible skills |
| 7 | Confirm | plain-language summary | docs written + skills, incl. deep-discovered |

Two facts that make this safe and cheap:
- **`haus apply` does not re-recommend** — it reads `recommendation.json`
  ([src/commands/apply.ts:44](../../src/commands/apply.ts)). That is *why* step 5 (`haus recommend`)
  is required between the docs skill and the second apply.
- **Apply is diff-first** ([src/claude/write-claude-files.ts](../../src/claude/write-claude-files.ts)) —
  the second apply only writes what changed, so running apply twice is near-free.

---

## Task 1: Guard test for the new orchestration

**Goal:** A failing test that pins the command prompt's critical contract — it must reference the
docs skill at the manifest-derived path and run `haus recommend` *before* the final `haus apply`.

**Files:**
- Create: `tests/haus-setup-command.test.js`
- Reads (no modify): `library/global/commands/haus-setup.md`, `library/catalog/manifest.json`

**Acceptance Criteria:**
- [ ] Test asserts the command file references `.claude/skills/<basename>/SKILL.md`, where
  `<basename>` is `path.basename` of the `haus.writing-documentation` manifest `path` (so a
  manifest path change breaks the test, not silently the feature).
- [ ] Test asserts the file mentions `deep-context.json`.
- [ ] Test asserts ordering: the index of `haus recommend` is greater than the first
  `writing-documentation` reference and less than the **last** `haus apply --write`.
- [ ] Test fails against the current (pre-rewrite) file.

**Verify:** `node --test tests/haus-setup-command.test.js` → FAIL before Task 2, PASS after.

**Steps:**

- [ ] **Step 1: Write the failing test**

```javascript
// tests/haus-setup-command.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CMD = fs.readFileSync('library/global/commands/haus-setup.md', 'utf8')
const MANIFEST = JSON.parse(fs.readFileSync('library/catalog/manifest.json', 'utf8'))

function docsSkillBasename() {
  const entry = MANIFEST.items.find((i) => i.id === 'haus.writing-documentation')
  assert.ok(entry, 'writing-documentation must exist in the catalog manifest')
  return path.basename(entry.path) // skills/haus-owned/general/writing-documentation -> writing-documentation
}

test('haus-setup references the installed docs skill at the manifest-derived path', () => {
  const expectedPath = `.claude/skills/${docsSkillBasename()}/SKILL.md`
  assert.ok(
    CMD.includes(expectedPath),
    `command should tell the agent to read ${expectedPath}`,
  )
})

test('haus-setup instructs writing deep-context.json', () => {
  assert.ok(CMD.includes('deep-context.json'), 'command must mention deep-context.json')
})

test('haus-setup runs `haus recommend` after the docs skill and before the final apply', () => {
  const firstSkillRef = CMD.indexOf('writing-documentation')
  const recommendIdx = CMD.indexOf('haus recommend')
  const lastApplyIdx = CMD.lastIndexOf('haus apply --write')
  assert.ok(firstSkillRef !== -1, 'must reference the docs skill')
  assert.ok(recommendIdx !== -1, 'must run `haus recommend`')
  assert.ok(lastApplyIdx !== -1, 'must run `haus apply --write`')
  assert.ok(recommendIdx > firstSkillRef, '`haus recommend` must come after the docs skill')
  assert.ok(recommendIdx < lastApplyIdx, '`haus recommend` must come before the final apply')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/haus-setup-command.test.js`
Expected: FAIL — current file has no `writing-documentation` reference, no `haus recommend`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/haus-setup-command.test.js
git commit -m "test(setup): guard /haus-setup deep-docs ordering and skill path"
```

---

## Task 2: Rewrite the `/haus-setup` orchestration prompt

**Goal:** Replace `haus-setup.md` with the 7-step flow so the deep-docs loop runs automatically.

**Files:**
- Modify (full rewrite): `library/global/commands/haus-setup.md`

**Acceptance Criteria:**
- [ ] File describes all 7 steps in order (detect → Q&A → record → first apply → deep scan →
  recommend → second apply → confirm).
- [ ] Step 5 instructs reading `.claude/skills/writing-documentation/SKILL.md` and following it
  inline to write docs + `deep-context.json`, and to never alter the `HAUS:BEGIN/END` block.
- [ ] Step 6 runs `haus recommend`; step 7 runs `haus apply --write` again.
- [ ] Includes graceful degradation: if the deep scan can't complete, say so and finish with the
  step-4 basics (never leave the project half-applied).
- [ ] File stays frontmatter-free (line-1 HAUS-MANAGED stamp stays harmless).
- [ ] Task 1's test now passes.

**Verify:** `node --test tests/haus-setup-command.test.js tests/install.test.js` → PASS.

**Steps:**

- [ ] **Step 1: Replace the file with the new content**

Write `library/global/commands/haus-setup.md` exactly as:

```markdown
Set up this project with haus, conversationally. The person you're helping may
not be a developer — never make them open a terminal or read JSON. You run the
commands; they read plain language and approve.

Do this in order:

1. **Detect.** Run `haus setup-project --fast --json`. Read the JSON yourself —
   do not show it. Translate what was detected into one or two plain sentences,
   e.g. "This looks like a Next.js website using Yarn. I found unit tests but no
   end-to-end tests." If the detection status is `unknown` or `partial`, say so
   honestly ("I couldn't fully recognise this stack, so I'll apply the general
   workflow and security guidance").

2. **Ask the guided questions as chat.** Ask the project's guided questions one
   or two at a time, in plain language. Collect the answers.

3. **Record answers.** Write the answers to `.haus-workflow/setup-answers.json`
   as a flat `{ "question": "answer" }` object (the exact question strings as
   keys). This is what lets setup proceed without re-prompting.

4. **Apply the basics.** Run `haus apply --write`. Read the result. This installs
   the core guardrails and helpers — including the documentation skill haus uses
   in the next step.

5. **Write the project docs (this is what makes the setup smart).** Open and
   follow the instructions in `.claude/skills/writing-documentation/SKILL.md`,
   which step 4 just installed. Following it, do a deep read of the project and:
   - write the project documentation (the `CLAUDE.md` body and `docs/` files).
     NEVER alter the `<!-- HAUS:BEGIN haus-imports … -->` … `<!-- HAUS:END … -->`
     block in `CLAUDE.md`; write around it.
   - write `.haus-workflow/deep-context.json` describing what the deep read found
     (roles, stacks, patterns the quick scan in step 1 could not see).
   If this step can't be completed for any reason, say so plainly and skip to
   step 8 — setup still finishes correctly with the basics from step 4.

6. **Re-check recommendations with the new understanding.** Run `haus recommend`.
   It re-reads `deep-context.json` and may surface extra helpers matching what the
   deep read discovered. You MUST run this before the next apply — `haus apply`
   does not re-calculate recommendations on its own.

7. **Apply the rest.** Run `haus apply --write` again. It only writes what changed,
   so this just adds the newly-matched helpers from step 6.

8. **Confirm.** End with one plain-language line, for example:
   "✅ Your project is configured — I wrote your project docs, added N guardrails
   and M coding helpers (K matched after reading your code in depth). Run
   `/haus-doctor` any time to re-check." Fill the numbers from the apply output.

If anything fails, explain what happened in plain language and what you'll try
next — don't dump raw errors.
```

- [ ] **Step 2: Run the guard + install tests**

Run: `node --test tests/haus-setup-command.test.js tests/install.test.js`
Expected: PASS (ordering + path guard satisfied; install copy/manifest unchanged).

- [ ] **Step 3: Full gate**

Run: `yarn verify`
Expected: typecheck + lint + build + test all green.

- [ ] **Step 4: Commit**

```bash
git add library/global/commands/haus-setup.md
git commit -m "feat(setup): run deep-docs pass automatically in /haus-setup"
```

---

## Task 3: End-to-end verification on a fixture project

**Goal:** Prove the automated loop produces docs + at least one deep-discovered skill in one run,
and that a re-run is non-destructive.

**USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current
conversation (the spec's verification gate). It MUST NOT be closed by walking around it, by
declaring it "verified inline", or by substituting a cheaper check. Close only after every item
in the acceptance criteria has been re-validated independently, with output captured.

**Files:**
- No source changes. Uses a throwaway fixture repo + the built CLI.

**Acceptance Criteria:**
- [ ] On a fresh fixture repo, walking the new `/haus-setup` steps manually (or via the agent)
  produces `.haus-workflow/deep-context.json`.
- [ ] The project `CLAUDE.md` has docs content AND an intact `<!-- HAUS:BEGIN haus-imports … -->`
  … `<!-- HAUS:END … -->` block.
- [ ] A skill that the shallow scan did NOT recommend is present in `.claude/skills/` after the
  second apply (i.e. enrichment added at least one), OR — if the fixture genuinely has nothing
  extra to discover — `haus recommend` output is identical before/after, confirming graceful
  no-op (capture which case occurred).
- [ ] Running the loop a second time on the now-configured repo makes no destructive changes
  (`git status` / diff shows only intended doc refreshes; import block untouched).

**Verify:** Manual walkthrough, capturing terminal output for each criterion:
```bash
# in a throwaway repo with a package.json the scanner under-detects
node <repo>/dist/cli.js setup-project --fast --json
node <repo>/dist/cli.js apply --write
# follow .claude/skills/writing-documentation/SKILL.md → write deep-context.json + docs
node <repo>/dist/cli.js recommend
node <repo>/dist/cli.js apply --write
ls .claude/skills && cat .haus-workflow/deep-context.json
```

**Steps:**

- [ ] **Step 1:** Build the CLI: `yarn build`.
- [ ] **Step 2:** Create a throwaway repo whose stack the shallow scanner under-detects (so the
  deep scan has something to add), run steps 1–7 of the new flow, capturing output.
- [ ] **Step 3:** Assert each acceptance criterion against captured output; record which
  enrichment case occurred (added-skill vs. graceful no-op).
- [ ] **Step 4:** Re-run the loop; confirm non-destructive (`git status`, import block intact).

---

## Self-review (spec coverage)

- Spec's "automate the three-step dance" → Task 2 (the prompt) + the existing two-pass plumbing.
- Spec's "graceful degradation" → Task 2 acceptance + step 5 degradation clause.
- Spec's "re-run safety / idempotency" (was T3) → folded into Task 3 criterion 4.
- Spec's "recommender two-pass regression" (was T4) → already covered by
  `tests/deep-context-enrichment.test.js`; no new task (noted above).
- Spec's "installed skill path" (was T1) → resolved to `.claude/skills/writing-documentation/`
  and pinned by Task 1's guard test.

## Out of scope

- Promoting `writing-documentation` to a global skill (rejected).
- Any recommender/CLI/scanner logic change; new hooks or auto-firing triggers.
- Workspace (multi-repo) mode — app mode only.

## Open question (deferred unless wanted)

- Should the deep scan in step 5 also read `setup-answers.json` (guided intent) as an extra seed,
  not just `context-map.json`? Left out; easy follow-up if desired.

## Task order

Task 1 (failing guard test) → Task 2 (rewrite, turns it green) → Task 3 (manual E2E gate).
