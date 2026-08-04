# ADR-0018: `haus backups` restore safety model — never follow symlinks, always require an explicit prune bound

- **Status:** Accepted | **Date:** 2026-08-04
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/commands/backups.ts`, `src/cli.ts`, `tests/backups.test.js`
- **Related:** [docs/plans/cli-audit-section-8-and-prune.md](../plans/cli-audit-section-8-and-prune.md) (Task C), [ADR-0017](0017-apply-prune-safety-model.md) (the backup-writing side of this same directory)

## Context

ADR-0017 noted that `.haus-workflow/backups/` had accumulated three naming schemes (`haus.lock.<timestamp>.json`, `undo-<timestamp>/`, `prune-<timestamp>/`) with "nothing yet to list, restore, or prune backups themselves" and flagged it as a separate, already-planned task. This PR builds that task (`haus backups list/restore/prune`).

Unlike ADR-0017, which governs _writing_ backups before a deletion, this command governs _reading them back_ — copying backup content into the live project tree, and deleting backup entries outright. An adversarial fresh-context review of the implementation surfaced two safety gaps before merge, both closed in the same PR, and both worth recording since they set the policy for how this command treats untrusted backup content and destructive flags.

## Decision

1. **`restore` never follows a symlink found inside a backup directory.** `.haus-workflow/backups/` is not gitignored, so a backup directory (and anything inside it, including a symlink) can be committed and shipped in a branch or PR like any other file. `collectFilesRecursive` uses `fs.lstat`, not `fs.stat`, specifically so a symlink is detected and skipped — never dereferenced — before any copy happens. Without this, a symlink inside an `undo-`/`prune-` backup pointing outside the project root would have its _target's_ content copied into the project tree on restore, an unintended file-content-disclosure/injection path reachable without any prior write access beyond getting the symlink committed.
2. **`haus backups prune` refuses to run unless `--older-than` or `--keep` is given, and both are validated as non-negative (integer, for `--keep`) before use.** An unvalidated negative `--keep` (e.g. `-1`) would otherwise compute `entries.length - keep > entries.length`, and `.slice(0, excess)` clamps to the full array — silently removing every backup despite an explicit bound having been supplied. A non-numeric or negative `--older-than` has the equivalent failure mode (a future cutoff timestamp matches every existing entry). Validation happens once, at the command boundary in `runBackups`, before either code path can act on the value.
3. **Restore warns but does not refuse when the destination is newer than the backup being restored.** The warning names both timestamps. This mirrors the "explicit user action, not automatic" stance ADR-0017 took for `--prune`'s own deletions — a user restoring a specific backup by id has already stated intent; the tool's job is to make the risk visible, not to second-guess it.

## Motivation (why)

- This command's whole purpose is undoing damage from another haus operation (`undo`, `apply --prune`, `update`). A restore path that can itself become an attack surface, or a prune command that can be tricked into wiping every recovery point in one run, defeats that purpose more thoroughly than the bugs it exists to recover from.
- `--older-than`/`--keep` validation follows the same "validate at boundaries" default this codebase already applies elsewhere (`WORKFLOW.md`'s security defaults) — reject malformed input at the command layer rather than letting it flow into deletion logic that assumes well-formed numbers.

## Alternatives considered

- **Dereference symlinks but restrict targets to paths inside the project root** — rejected as more complex and no safer in practice: the check would need to run before every copy, on every path segment, permanently trailing the class of race/edge-case bugs a flat "never follow" rule avoids by construction. Nothing in the three legitimate backup-writing call sites (`applyLock`, `backupManagedFilesBeforeUndo`, `backupBeforePrune`) ever creates a symlink, so refusing them costs no legitimate functionality today.
- **Default `prune` to a safe implicit bound (e.g. `--keep 20`) instead of refusing outright** — rejected; an implicit default is exactly the kind of surprising, hard-to-reverse automatic behavior ADR-0014 and ADR-0017 already ruled out for deletion paths in this codebase. An explicit bound, chosen by the user, is one flag away.
- **Reject an unvalidated `--keep`/`--older-than` with a warning and clamp to a safe value instead of erroring** — rejected; clamping silently changes what the user asked for into something else that still deletes backups, which is worse than refusing and asking them to fix the input.

## Consequences

- A symlink inside a backup directory is always skipped and reported by name during restore, never copied or dereferenced — real backed-up files in the same directory still restore normally.
- `--keep`/`--older-than` reject non-numeric, negative, or (for `--keep`) non-integer input with an explicit error instead of silently no-op-ing or deleting more than intended.
- `haus backups` does not currently offer a `--json` output mode (out of scope for this task, per the CLI audit item it implements) — a future consumer that wants machine-readable backup listings will need a follow-up, not covered by this decision.
