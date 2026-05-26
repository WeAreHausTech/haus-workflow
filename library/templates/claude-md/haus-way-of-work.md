# Haus way of work

General instructions for every project using the Haus AI workflow.

## Context before coding

Before starting any task, orient yourself:

1. Read `.haus-workflow/project.md` for repo facts (stack, roles, package manager).
2. Check `.haus-workflow/recommendation.json` to see which skills and agents are active for this project.
3. Run `haus context --task "<task>"` to load the minimal context set for your current task.

Use `haus doctor` when hooks, context, or settings seem stale.

## Output discipline

- Write only the files the task requires. No speculative refactors.
- Default to no comments — only add one when the **why** is non-obvious.
- No multi-paragraph docstrings, no trailing summaries, no "I just did X" narration.
- Match the existing code style. If the repo uses tabs, use tabs.

## Commit hygiene

- Conventional Commits format: `type(scope): subject` (subject ≤ 50 chars).
- Body only when the why is not obvious from the diff.
- Never skip pre-commit hooks (`--no-verify`).
- One logical change per commit. Do not bundle unrelated fixes.

## Safety rails

- Never read files that look like secrets (`.env`, `*credentials*`, `*secret*`, `*token*`).
- Never run destructive shell commands without explicit user confirmation.
- Never force-push to `main` or `master`.
- Validate at system boundaries (user input, external APIs). Trust internal framework guarantees.

## PR workflow

- Merge each PR to `main` before starting the next branch — no stacking.
- Run the full test suite and `haus verify` before opening a PR.
- Report actual test results in the PR body — no unchecked checkboxes.
