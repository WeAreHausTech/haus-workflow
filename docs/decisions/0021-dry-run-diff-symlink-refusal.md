# ADR-0021: Real dry-run diff for catalog items — never follow a symlink into the preview

- **Status:** Accepted | **Date:** 2026-08-04
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/claude/write-claude-files.ts`, `tests/apply.test.js`
- **Related:** [docs/plans/cli-audit-section-8-and-prune.md](../plans/cli-audit-section-8-and-prune.md) (Task B), [ADR-0019](0019-haus-backups-restore-safety-model.md) (the same symlink-never-follow policy applied to `haus backups restore`), `src/install/scaffold.ts` (the original instance of this refusal, for `haus scaffold`)

## Context

`haus apply --dry-run` previously printed only `"<path>: would create"` / `"would overwrite"` for catalog items (skills, agents, templates, commands) — no actual content comparison happened, unlike WORKFLOW.md and settings.json, which already get real unified diffs via `writeManagedText`. This PR brings catalog items to the same standard, reusing the same `createUnifiedDiff` helper (CLI audit §8 item 1).

Building the per-file walk needed for skill (directory) items surfaced a real, exploitable gap, found in adversarial review before this shipped: the walk followed symlinks.

## Decision

1. **The dry-run diff preview never follows a symlink inside a catalog item's source content.** `listFilesRecursive` (the recursive file walker backing the new diff) uses `fs.lstat` at each level and refuses (skips, with a warning) anything that is a symlink — file or directory — rather than resolving it. This is the same policy `src/install/scaffold.ts` already applies to `haus scaffold`'s catalog content ("Refuse symlinked catalog content: a malicious link could point outside the catalog root") and `haus backups restore` applies per ADR-0019 — this is the third instance of the same rule, not a new one.
2. **This matters even though the dry-run path never writes anything.** A symlink inside a catalog skill directory (e.g. pointing at `~/.ssh/id_rsa`, `.env`, or a sibling repo) would, if followed, have its _target's_ content read and printed directly in the diff output (`createUnifiedDiff(printable, '', nextText)` for a new file, or as one side of a real diff for a changed one) — a read-only preview becoming a way to exfiltrate an arbitrary host file's content, with no write required to trigger it.
3. **Binary content is compared by raw buffer equality, and a diff is only ever rendered when both sides decode as text.** Reusing `hash-installed.ts`'s existing lossless-UTF-8-round-trip technique for binary detection, rather than inventing a second one.
4. **A skill's real write (`installCatalogSkill`) removes the whole destination directory then copies the new source in — not an incremental merge.** The dry-run preview mirrors this: a destination file with no counterpart in the new source is reported as `would remove`, not silently omitted, so the preview doesn't understate what a real apply would actually delete.

## Motivation (why)

- The write path (`fs.copy` in `installCatalogSkill`) already doesn't have this leak — fs-extra's `copy()` defaults to `dereference: false` and recreates the symlink itself rather than reading through it. The new dry-run _read_ path introduced a hole the existing _write_ path never had, which is exactly the kind of "new code path, old lesson not reapplied" gap CLAUDE.md's own audit trail (ADR-0019, `scaffold.ts`) exists to prevent from recurring silently.
- A preview that doesn't account for the write path's real remove-then-copy semantics for skills would be actively misleading — understating what `--write` will actually change is worse than the original bare "would overwrite" message it replaces.

## Alternatives considered

- **Follow symlinks but validate the resolved path stays under the catalog root** (a containment check, like `scaffold.ts` does for the top-level `sourcePath` before this fix) — rejected in favor of the simpler flat refusal `scaffold.ts`'s per-file helper (`scaffoldFile`) and `haus backups` (ADR-0019) both already settled on: no legitimate catalog item needs a symlink inside its content, so refusing outright costs nothing and avoids trailing a class of path-resolution edge cases a containment check can get subtly wrong.
- **Only diff single-file items in this task, and defer skill (directory) items to a follow-up** — rejected; the CLI audit's own §8 item 1 wording ("Skill items... get a per-file diff loop") is explicit that both are in scope, and splitting them would leave the more common item type (skills) with the original uninformative "would overwrite" message.

## Consequences

- `--dry-run` now fully reads every catalog file's content (both source and, when present, destination) on every invocation, rather than only checking existence — a real behavior change from before (previously O(1) per file), though it matches the read-cost this codebase's own `hashInstalledPaths` already pays on every `apply`/`update` run. A skill with an unusually large binary asset under `references/` will make `--dry-run` measurably heavier than before; not treated as a blocker, since accuracy was the whole point of this task, but worth knowing if it's ever raised as a performance report.
- Symlinks are silently unusable inside catalog item content going forward for the dry-run preview specifically (they were already unusable for the real write, and for `scaffold`/`backups restore`) — a catalog author who genuinely needs one would need a different mechanism entirely; none exists today, and none is proposed here.
