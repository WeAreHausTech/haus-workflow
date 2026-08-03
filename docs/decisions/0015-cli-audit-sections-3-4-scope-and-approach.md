# ADR-0015: CLI audit sections 3 & 4 — workspace undo scope and check-tier honesty

- **Status:** Accepted | **Date:** 2026-08-03
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/commands/workspace/undo.ts` (new), `src/commands/undo.ts`, `src/commands/update.ts`, `src/commands/apply.ts`, `src/refs/fetch-refs.ts`
- **Related:** [docs/plans/cli-audit-sections-3-4.md](../plans/cli-audit-sections-3-4.md), [ADR-0014](0014-cli-audit-remediation-scope-and-approach.md)

## Context

A follow-up pass on the same source-level audit (sections 3 and 4: incomplete functionality, could-be-improved) added a genuinely new command (`haus workspace undo`) and two data-shape decisions (`update --check --fast`'s output honesty, `urlToSlug`'s backward-compatible collision fix). These are worth recording on their own — they're new capability and API-shape choices, not just bug fixes like ADR-0014's pass.

## Decision

1. **`haus workspace undo` reuses per-repo `runUndo` verbatim, parameterized by an explicit `root`.** Rather than reimplementing per-repo teardown logic at the workspace layer, `runUndo`'s signature gained an optional `root` (defaulting to `process.cwd()`), mirroring the exact precedent `setup-core.ts` already set for the same reason (`refresh-project.ts`'s comment: "so command handlers do not import each other" / setup-core's own docblock: "parameterized on an explicit root"). This guarantees workspace-level undo can never drift from single-repo `haus undo`'s hash-gated safety contract.

2. **Workspace-root artifact removal only targets machine-generated output.** `writeWorkspaceArtifacts`'s four files, `workspace.manifest.json`, and the workspace CLAUDE.md/WORKSPACE.md haus content are removed; `haus.workspace.yaml` — the user's own config — is never touched. The workspace doc removal reuses the exact same `stripHausBlock`/`BLOCK_BEGIN` sentinels per-repo `undo.ts` already uses, since `write-workspace-claude-md.ts` deliberately shares those sentinels with `write-root-claude-md.ts`.

3. **`update --check --fast` omits the `ok` field entirely rather than guessing it.** The fast tier (built on `readLockSummary`, no per-item hashing) cannot know whether content has drifted. Setting `ok: true` would imply "verified fine"; omitting it plus a `checkMode: 'fast'` marker is the honest signal. The fast tier also never fails the process exit code on its own, for the same reason.

4. **`urlToSlug`'s protocol-collision fix keeps the existing https slug format unchanged.** Only non-https protocols (`http:`) get a distinguishing prefix. This was a deliberate backward-compatibility choice over a uniform reformat: https is the overwhelmingly common case for the llms.txt references this function slugs, and changing every existing cache filename's format for a fix that only needs to distinguish the rare http/https collision case would have been a larger blast radius than the bug warranted.

## Motivation (why)

- Every item shipped with a regression test proving the specific gap the audit named (e.g. a locally-modified lock-tracked file surviving `workspace undo`; `http://` vs `https://` producing different slugs; `--fast` never claiming to have hashed anything).
- `haus workspace doctor`'s new cross-repo `catalogRef` check (section 3, item 3) reused data `checkLock` already computed per repo — no new data collection, just a comparison that was previously never made.

## Alternatives considered

- **Have `workspace undo` shell out to the `haus undo` CLI per repo** (subprocess per member) — rejected; direct function reuse avoids process-spawn overhead and keeps error handling (per-repo failure isolation, matching `workspace setup`'s own `--continue-on-error` precedent) in the same process.
- **`update --check --fast` reports `ok: true` when the lock summary alone shows no obvious problem** — rejected per decision 3 above; a false sense of verification is worse than an honest "unknown."
- **Reformat `urlToSlug`'s output uniformly (always prefix with protocol)** — rejected per decision 4 above; unnecessary churn for the common case.

## Consequences

- `runUndo`'s exported signature changed (`root` added as optional) — source-compatible for the existing single-repo CLI caller, which passes no `root` and gets the old `process.cwd()` behavior unchanged.
- `update --check --fast`'s JSON output has a slightly different field set than `--check`'s (no `ok`) — any external tooling parsing `update --check` output should check for `checkMode` before assuming `ok` is present.
- `haus workspace undo` has no `--dry-run` in this pass (unlike `haus undo`, which has none either) — a future request for a workspace-level preview mode would need its own follow-up, not assumed here.
