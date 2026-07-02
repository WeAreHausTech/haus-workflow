# ADR-0011: Consolidate haus-\* commands into the haus-workflow skill

- **Status:** Accepted | **Date:** 2026-07-01

## Context

`library/global/commands/` shipped 5 standalone global slash commands
(`haus-setup.md`, `haus-clone.md`, `haus-cloneandsetup.md`, `haus-doctor.md`,
`haus-fix.md`) alongside the `haus-workflow` skill. The skill's own task-dispatch
procedures (`project:init`, `project:clone`, `project:cloneandsetup`) worked by
telling the agent to open and follow the installed command file at
`~/.claude/commands/haus-*.md` — the skill was a thin router in front of commands
that also worked standalone.

This produced two problems:

1. **Duplicate discovery surface.** Two independent things did overlapping jobs
   (`/haus-setup` vs `/haus-workflow project:init`), and users had to learn both
   the skill's task-name convention and 5 separate command names.
2. **A silent description bug.** `src/claude/write-claude-files.ts` wrote a
   project-local `.claude/commands/haus-doctor.md` **stub** on every
   `haus apply --write` — a bare one-liner with no YAML frontmatter, hence no
   `description:` — which shadowed the properly-described global command and
   showed as `Run \`haus doctor\`.` in Claude Code's command picker. Because the
   command surface was duplicated (global copy + project-local stub), the bug
   went unnoticed: fixing the global file's frontmatter never touched the
   project-local stub that most sessions actually loaded.

Growing the task list (`project:reinit`, `project:fix`, `help`) would have meant
adding 2 more standalone commands, further widening the duplicate surface.

## Decision

Delete the 5 standalone commands. Everything routes through `/haus-workflow <task>`
only. The procedure bodies that used to live in the command files move verbatim
into `library/global/skills/haus-workflow/references/{init,clone,cloneandsetup}.md`
— plain reference docs the skill's `SKILL.md` points at directly (no more
`~/.claude/commands/haus-*.md` indirection). `doctor` and `fix` are short enough
to fold inline into `SKILL.md` with no separate reference file.

This is a breaking change to the public command surface: `/haus-setup`,
`/haus-clone`, `/haus-cloneandsetup`, `/haus-doctor`, and `/haus-fix` no longer
exist. Existing global installs self-clean the old files via the installer's
existing manifest-diff orphan-pruning (`src/install/apply.ts`) on the next
`haus update`/`haus install` — no migration shim needed, since nothing outside
the installer's own manifest tracking referenced the old filenames.

Consolidating also fixed the description bug directly: the project-local
`haus-doctor.md` write is removed entirely (with a legacy-stub cleanup pass,
mirroring the existing `haus-review.md` cleanup, so already-set-up projects get
the stale file pruned on next apply) rather than patched in place.

### A gap this exposed

`src/install/apply.ts`'s global installer (`collectSourceFiles`) only ever
installed a skill's top-level `SKILL.md` — it text-stamps and copies that one
file, unlike the project-level catalog installer which `fs.copy`s whole skill
directories. Since `SKILL.md` now points at `references/*.md`, that file alone
installing would have broken `/haus-workflow` at runtime the first time a task
tried to open a reference file that was never copied to `~/.claude/`.

Fixed by adding `collectSkillAuxFiles()`: it walks a skill's directory
recursively (`fs.readdirSync(dir, { recursive: true })`, safe given this repo's
`engines.node >= 22`) for every file besides `SKILL.md`, and installs each one
individually — stamped, hashed, and tracked in the install manifest exactly like
`SKILL.md` — so `haus uninstall` removes them and the existing orphan-pruning
cleans up renames/removals under `references/` the same way it does for
top-level files.

## Consequences

- One command surface (`/haus-workflow <task>`) instead of six. New tasks
  (`project:reinit`, `project:fix`, `help`) added without growing the standalone
  command count.
- The description-bug class (a managed file written with no frontmatter, shadowing
  a properly-described copy) cannot recur for this file, because there is only
  one copy of the doctor procedure left (inline in `SKILL.md`), not two.
- Global skills can now ship multi-file structures (`references/`, and by the
  same mechanism any future subdirectory) — previously only project-level catalog
  skills (via `fs.copy`) could do this.
- Users/scripts that invoked `/haus-setup` etc. directly must switch to
  `/haus-workflow project:init` etc. Documented in `docs/cli.md`,
  `docs/runbook.md`, and the commit's `BREAKING CHANGE:` footer.

## Alternatives considered

- **Rename the 5 commands instead of deleting them** (e.g. `haus-setup.md` →
  `haus-project-init.md`), keeping a standalone-command surface parallel to the
  skill. Rejected: doesn't address the duplicate-surface problem (still 5+
  commands to maintain alongside the skill's task table), and doesn't remove the
  root cause of the description bug (two copies of the same procedure can still
  drift out of sync).
- **Keep a project-local fallback for `/haus-workflow` itself** (copy the whole
  skill into `./.claude/skills/` on `haus apply --write`, the way `haus-doctor.md`
  used to be project-local), so a teammate without haus installed globally still
  gets _something_. Rejected for this change: no command other than `haus-doctor`
  ever had that fallback, so removing it is consistent with existing behavior for
  `haus-setup`/`haus-clone`/`haus-cloneandsetup`/`haus-fix` (always global-install-only)
  rather than a new regression. Revisit if teammate-without-global-install turns out
  to be a real recurring complaint.
