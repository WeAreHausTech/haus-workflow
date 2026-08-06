# ADR-0028: Workspace cross-repo context — copy-with-provenance, not symlink

- **Status:** Proposed | **Date:** 2026-08-05
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/workspace/link-context/*`, `src/commands/workspace/link-context.ts`, `src/commands/workspace/manifest.ts`, `src/commands/workspace/doctor.ts`, `src/commands/workspace/setup.ts`, `src/commands/workspace/undo.ts`, `src/claude/write-gitignore.ts`
- **Related:** [docs/plans/workspace-detection-and-permissions-fixes.md](../plans/workspace-detection-and-permissions-fixes.md) Task 3.4 (D6, revised); [ADR-0019](0019-haus-backups-restore-safety-model.md), [ADR-0021](0021-dry-run-diff-symlink-refusal.md) (this codebase's existing never-follow/never-create-symlink policy)

## Context

D6 in the original bug report observed that a member repo's `.claude/skills/`,
`.claude/agents/`, and `.claude/commands/` never surface when a Claude Code session
starts at a multi-repo workspace root, even though the files are physically present
under the tree. The plan's original working hypothesis was that **"Claude Code's
directory-scoped skill discovery stops recursing at a nested `.git` boundary."**

**That hypothesis is disproven.** A spike (Task 3.4a, already run and reviewed
before this ADR was written) checked Anthropic's own documented discovery behavior
directly: symlinks placed under `.claude/skills/<name>` (or `agents`/`commands`) ARE
followed, and there is no documented `.git`-boundary check in skill or agent
discovery that would explain the reported symptom. The actual likely cause of the
original symptom is different and more mundane: nested `.claude/skills/` directories
_below_ a session's starting directory load lazily — only once Claude reads or edits
a file in that subtree during the session — and, per the docs, load under a
directory-qualified name rather than being hard-blocked. There is no git-boundary
defeat mechanism at play; this ADR does not restate that claim as fact anywhere
below, and any future reader relying on this document should treat the git-boundary
theory as investigated and rejected, not as an open question.

Given that correction, the user explicitly confirmed: **build the cross-repo
visibility feature anyway** (D6 is a real gap — nothing today makes a sibling
repo's skill/agent/command appear at the workspace root at all), but the design
must not lean on the disproven git-boundary claim, and must stand on its own
merits independent of exactly how Claude Code's discovery internals behave today.

## Decision

`haus workspace link-context` **copies** (never symlinks) each already
haus-initialized member repo's skill/agent/command directories/files into the
workspace root's own `.claude/{skills,agents,commands}/<repo-folder>--<name>`,
stamped with source provenance (repo, source-relative path, content hash) in
`.haus-workflow/workspace.manifest.json`'s new `linkedContext` section — not in the
copied files themselves (manifest-only provenance was explicitly the least-invasive
option the plan allowed, and mutating a copied `SKILL.md`/agent/command file's
content risks corrupting YAML frontmatter Claude Code's own discovery depends on;
copies are therefore byte-identical to their source).

This choice does **not** rest on the disproven git-boundary theory. It rests on
four independent reasons, every one of which holds regardless of what 3.4a found:

1. **Existing security posture.** This codebase already refuses to create or follow
   symlinks in every comparable code path — `src/install/scaffold.ts` (the original
   instance, per ADR-0021's own text), `src/claude/write-claude-files.ts`'s dry-run
   diff walker (ADR-0021), and `src/commands/backups.ts`'s restore path (ADR-0019).
   A cross-repo symlink into another repo's working tree would be the first
   symlink-creating code path in the CLI — a new category of exception to defend,
   not a natural extension of anything that exists today. (Note, corrected from the
   plan's own citation: this posture is documented in ADR-0019/ADR-0021, not
   ADR-0010, which covers unrelated supply-chain hardening — verified directly
   against ADR-0010's text before writing this ADR.)
2. **Windows symlink-permission friction.** Creating a symlink on Windows requires
   Developer Mode or an elevated process in the common case; a workspace-setup step
   that silently fails (or requires elevation) on one of three major platforms is a
   worse default than a copy that always works.
3. **Independent of another tool's internals.** Even with 3.4a's finding that
   symlinks are followed _today_, that is Claude Code's current, undocumented-at-
   the-implementation-level behavior — not a contract this CLI controls or that is
   guaranteed to hold identically across future versions. A documented behavior can
   still change; building a permanent cross-repo visibility feature on it would
   silently regress on some future Claude Code release with no signal to this CLI.
4. **The lazy-load / directory-qualified-name behavior is itself a bad fit here,
   symlink or not.** Even granting the corrected finding — nested skills load lazily
   and get a directory-qualified name — that is exactly the opposite of what this
   feature wants: cross-repo skills visible **immediately at session start**, under
   a **clean, collision-free name** (`<repo-folder>--<name>`), not lazily-loaded and
   qualified by an incidental directory path. Copying into the workspace root's own
   `.claude/skills/` achieves that regardless of how the nested-directory question
   resolves.

### Staleness tradeoff accepted

A copy can drift from its source: if a member repo's skill changes after
`link-context` last ran, the workspace-root copy silently keeps serving the old
content until someone re-runs the command. This is accepted, with one mitigation:
`haus workspace doctor` (workspace-scoped, `src/commands/workspace/doctor.ts`)
re-hashes each `linkedContext` entry's live source (via the same
`hashInstalledPaths` helper `checkLock`/`haus.lock.json` drift detection already
uses — not a new hashing mechanism) and flags a mismatch as `stale-linked-context`,
distinct from the `invalid-lock`/`missing-claude` flags used for actual
catalog-managed-file tampering. A stale copy is never silently indistinguishable
from a tampered one, but it is also never auto-healed — `doctor` only reports;
fixing it is always an explicit `haus workspace link-context` re-run, matching this
manifest's existing "advisory only, never self-corrects" contract
(`src/commands/workspace/manifest.ts`'s own docblock).

### Collision policy

Two member repos whose folder name collapses to the same `<repo-folder>` prefix
_and_ who both carry a same-named skill/agent/command produce a genuine destination
collision. `link-context` detects every such collision up front and refuses to
write **anything** for that run rather than picking a silent winner — "never
silently overwrite" from the plan's own edge-case list. The fix is a rename (of one
repo's configured path, or the conflicting asset) — there is no configuration flag
to force a winner.

## Alternatives considered

- **Symlink, now that 3.4a shows Claude Code follows it.** Rejected — see reasons
  1-4 above; the corrected spike result removes the original _justification_ for
  symlinking (there was never a discovery-defeating boundary to work around by
  linking instead of copying), it doesn't newly justify choosing it.
- **Index-only manifest, no copy or symlink at all** (the original D6 design).
  Already rejected by the plan before this ADR (see the plan's "Superseded design
  note") — an index is inert JSON; it never makes a sibling repo's skill invocable
  via Claude Code's own Skill tool/discovery, so it doesn't close the actual gap.
- **In-file provenance marker** (an HTML comment or frontmatter field stamped into
  every copied `SKILL.md`/agent/command). Rejected in favor of manifest-only
  provenance: `SKILL.md` frontmatter is parsed by Claude Code's own discovery, and
  the safest way to guarantee a copy behaves identically to its source is to copy it
  byte-for-byte and keep provenance entirely out-of-band, in
  `workspace.manifest.json`, which already exists for exactly this kind of derived,
  advisory record-keeping.

## Consequences

- A workspace root's `.claude/{skills,agents,commands}/` now contains generated,
  never-hand-edited entries alongside any of the workspace root's own genuinely
  authored ones (when the workspace root is itself a member repo). Generated
  entries are identifiable by the `<repo-folder>--` prefix and are tracked in
  `workspace.manifest.json`'s `linkedContext` section so `doctor`/`apply --write`
  never misreport them as drift.
- These copies are gitignored via a new, independent managed block in
  `src/claude/write-gitignore.ts` (`LINK_CONTEXT_GITIGNORE_BEGIN`/`_END`, glob
  patterns `.claude/{skills,agents,commands}/*--*`) — kept separate from the
  existing scan-artifacts block (`GITIGNORED_ARTIFACT_PATHS`) since the two serve
  different file classes and the scan-artifacts untrack flow's own messaging
  ("machine-local scan output") would be misleading applied to these.
- Editing a copy directly does nothing useful — the next `haus workspace
link-context` run overwrites it from the source again. This is intentional (the
  member repo remains the sole owner of the original) but is a real footgun for a
  user who doesn't realize the file they're editing is generated; the CLI's own
  log output for both `link-context` and the staleness flag is the mitigation
  today, not a write-protection mechanism.
- If Claude Code's own skill discovery is later confirmed (by a future, more
  thorough investigation) to make this copy step's `<repo-folder>--` prefix
  unnecessary or the copying unnecessary altogether, that would be a new decision —
  this ADR is written specifically so a future reader doesn't need to re-litigate
  the git-boundary question to evaluate it, since it never depended on that
  question's answer.
