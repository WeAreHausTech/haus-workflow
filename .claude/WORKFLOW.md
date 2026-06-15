# Agentic Development Workflow Standard

> Tech-agnostic methodology for AI-assisted software projects.

---

## Source-of-truth documents

| Workflow term | Default path                                                          |
| ------------- | --------------------------------------------------------------------- |
| Spec          | `docs/SPEC.md`                                                        |
| Design        | `docs/DESIGN.md`                                                      |
| UX flows      | `docs/UX.md`                                                          |
| Mockups       | `docs/design/` (gitignore binaries, commit README.txt)                |
| Plans         | `docs/plans/<feature-slug>.md` (one per feature, persist after merge) |
| Decision log  | `docs/adr/`                                                           |
| Failure modes | `docs/runbook.md`                                                     |

User says "spec", "design", "ux", "plan", "mockup": resolve to rows above.

---

## How to write rules that stick

- **Specific beats general.** "Run `npm test` before commit" over "test your changes". "Handlers live in `src/api/`" over "keep files organised".
- **Emphasis raises adherence.** Reserve `NEVER` / `YOU MUST` / `IMPORTANT` for rules that matter most. Overuse dilutes.
- **State the reason.** Rule with WHY survives edge cases; bare rule gets rationalised away.

---

## Feature workflow

Canonical loop: **explore -> plan -> code -> commit**. Steps below expand it. Ordered — do not skip.

**Escape hatch:** whole diff in one sentence (typo, copy tweak, one-line fix) → skip to step 5. Planning for multi-file changes, architecturally uncertain, or unfamiliar code. No ceremony-taxing trivial work.

**1. Explore. Read inputs.**
Read spec, design, UX, mockups, code to touch. No edits, no plan, no questions before this.

**2. Align intent.**
State assumptions. Flag gaps/conflicts between inputs. List ambiguous.
**Stop. Wait for explicit user OK before writing plan.**

**3. Write a plan.**
Break into discrete tasks. Each task needs: acceptance criteria (testable, not aspirational), verification steps (exact commands or manual checks), dependencies, source doc reference.
Save to `docs/plans/<slug>.md`.
**Stop. Wait for explicit user OK before executing.**

**4. Create an isolated workspace.**
NEVER edit on `main`. Create a feature branch or git worktree.

```bash
git worktree add .claude/worktrees/<slug> -b feat/<slug>
# .claude/worktrees/ must be in .gitignore
```

**5. Code.**
Work tasks sequentially unless independent (no shared state, no ordering dependency) — dispatch parallel subagents, each in own worktree.
All new code ships with tests. **Give every task verifiable signal** (test, build, lint, screenshot vs mockup): implement -> run check -> read result -> fix -> repeat until pass. Without pass/fail signal, "looks done" is only signal and you are verification loop.
**Bug surfaces: stop, diagnose root cause before any fix.** No symptom patches.

**6. Commit.**
Before merging: code review (adversarial, fresh context). Present merge/PR/cleanup options to user.
After major milestone: capture lessons learned, feed to standards backlog.

---

## NEVER rules

Apply in unattended mode. Reasons included — rules without context get overridden.

- **NEVER commit or push without explicit user OK**, unless inside an approved plan (plan approval = blanket exec authority for that plan's scope only).
- **NEVER use `git push --force`** on a published branch. Destroys history others may have pulled.
- **NEVER use `--no-verify`** on commit or push. Bypasses the quality gates hooks enforce.
- **NEVER rewrite history** on published commits (amend, rebase-with-force). Breaks anyone who pulled.
- **NEVER commit secrets**, credentials, tokens, or API keys. They are permanent in git history.
- **NEVER delete a branch** with unmerged work without explicit OK.
- **NEVER work directly on `main`.** Always a branch or worktree.
- **NEVER encode ambiguity silently.** Ambiguity = stop and ask. Log resolution as ADR.

---

## Settings: deterministic enforcement

`CLAUDE.md`/`AGENTS.md` rules advisory. `settings.json` permissions deterministic. Critical NEVER rules enforced in both.

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(git commit --no-verify:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Read(*.pem)",
      "Edit(*.pem)",
      "Write(*.pem)",
      "Read(*.key)",
      "Edit(*.key)",
      "Write(*.key)"
    ],
    "ask": ["Edit(.env)", "Write(.env)"]
  }
}
```

---

## Git

- **Squash-merge:** `gh pr merge <n> --squash --delete-branch`. Never plain `--merge`.
- **Conventional Commits:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`. Scope by domain: `feat(auth):`.

---

## Testing rules (non-negotiable)

No task done until tests pass locally. All new code ships with tests.

| Layer                         | Minimum bar                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Pure logic / domain functions | TDD. Test first, code second. Cover happy path + edge cases + invariants.                |
| UI components                 | One render-and-interact test per public component. Query by role/label, not class names. |
| Backend / data layer          | One integration test per repository function. Hits local emulator/test DB, never prod.   |
| Critical user flows           | One happy-path E2E per critical journey.                                                 |

**Verification gate:** run test suite for all touched layers, record passing output in task's verification block. Untested = unfinished.

**Highest-stakes logic** (e.g. financial, auth, medical, pedagogical): TDD-only. Write test from spec before implementation. No exceptions.

See `workflow-config.md` for this project's test commands.

---

## Pre-commit hooks

Use [Lefthook](https://github.com/evilmartians/lefthook) (Go binary, no Node dependency, faster than Husky). Write `fail_text` with agent-readable instructions — agent reads hook output to decide what to fix.

Gate every commit on (parallel):

1. Type check
2. Lint
3. Format
4. Secret scan: `! git diff --cached | grep -iE "(password|secret|token|api_key)\\s*[:=]\\s*['\"]"`

Gate unit tests on pre-push (slow). Never gate E2E in hooks.

See `lefthook.yml` (or your pre-commit config) for this project's exact hook commands.

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: npm run lint
      fail_text: 'Lint failed. Run `npm run lint -- --fix` to auto-fix, re-stage, then commit.'
    typecheck:
      run: npm run typecheck
      fail_text: 'Type errors found. Fix all type errors before committing.'
```

**CI trigger.** Local hooks only. Add CI when: second developer joins, broken commit reaches main, or before first public release.

---

## Security defaults

- **Default deny.** Access-control layers (DB rules, RLS, middleware) start denied, opened explicitly.
- **Security rules are implementation.** Write them in the same task as the feature they protect.
- **Validate at boundaries.** Parse/validate user input, API responses, env vars with schema library. Trust internal types downstream.
- **OWASP Top 10 check** before any new public route: injection, broken auth, IDOR, SSRF, misconfiguration.
- **Dependency audit** regularly. Block critical findings before release.

---

## Architecture Decision Records (ADR)

Write ADR when: choosing library/framework, defining data/security model, picking merge/deploy strategy, setting API contract, resolving spec conflict. Would make assumption → write ADR instead.

- Location: `docs/adr/`, filename: `NNNN-kebab-case-title.md`
- Write-once. To change: new ADR "Supersedes ADR-NNNN". Statuses: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-XXXX`.
- Maintain index table in `docs/adr/README.md`.

```markdown
# ADR-NNNN: [Title]

- **Status:** Accepted | **Date:** YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered
```

---

## Runbook

Maintain `docs/runbook.md`. One entry per non-obvious failure resolved.

```markdown
## [Short symptom]

**Symptom:** [exact error] **Cause:** [root cause] **Fix:** [exact command]
```

---

## Where facts live

Each fact has one home. Never duplicate across layers.

| Layer                       | What goes here                                                         | Load behaviour                                                     |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md` / `CLAUDE.md`   | Stable rules, commands, conventions                                    | Loaded in full, every session. Keep small.                         |
| Auto memory (`MEMORY.md`)   | Learnings the agent discovers (build quirks, debug insights, patterns) | First ~200 lines / 25 KB loaded. Accumulates without manual edits. |
| ADR (`docs/adr/`)           | Architectural decisions, library choices, policy                       | On demand. Permanent, write-once.                                  |
| Runbook (`docs/runbook.md`) | Failure modes + exact fix                                              | On demand. Permanent, append-only.                                 |
| `workflow-config.md`        | Doc paths, test commands, highest-stakes, tool choices                 | Loaded with WORKFLOW.md. Project-owned.                            |

Rule of thumb: ADR for WHY, runbook for HOW TO FIX, memory for what was LEARNED, `AGENTS.md` for the stable RULES, `workflow-config.md` for the project-specific VALUES.

---

## Subagent patterns

| Situation                           | Pattern                                   |
| ----------------------------------- | ----------------------------------------- |
| Multiple independent investigations | Parallel agents                           |
| Independent feature modules         | Parallel agents, each in its own worktree |
| State-dependent pipeline            | Sequential                                |
| Debugging a specific failure        | Single agent with full context            |

Each spawned agent needs self-contained prompt: file paths, relevant decisions, expected output format. No implicit context from parent session.

---

## Context management

Context is primary constraint. Performance degrades as window fills.

- **Clear between unrelated tasks.** Reset context (`/clear`) when switching to unrelated task. Long session with stale context underperforms fresh one.
- **Delegate investigation to subagents.** Reading 50 files pollutes main window. Send to subagent; keep only conclusion.
- **Correct early.** Agent drifts → stop and redirect. Same correction twice → clear and restart with sharper prompt.
- **Checkpoint before risky changes.** Use rewind/checkpoints — bad path is one undo away, not manual revert.

---

## Stop conditions (unattended mode)

Stop and ask when:

- Verification fails 3+ times on the same task.
- Spec/design/UX conflict requires product decision.
- Security hole can't close without new requirements.
- Build or tests are red after rebase.

---

## Accessibility floor

- Status never by colour alone: colour + icon + text.
- Touch targets: 44x44 px minimum on touch interfaces.
- Contrast: WCAG AA against background.
- Reduced-motion fallbacks for all state-conveying animations.
- All interactive elements keyboard-navigable with accessible labels.

---

## Multi-tool usage

`@`-import syntax (e.g. `@AGENTS.md`) works in Claude Code only. Other tools read files directly.

```
Claude Code:  CLAUDE.md       → @AGENTS.md (inline)
Cursor:       .cursorrules    → copy sections directly (no @-import)
Gemini:       GEMINI.md       → copy sections directly
All tools:    AGENTS.md       = canonical source of truth, edit here
```
