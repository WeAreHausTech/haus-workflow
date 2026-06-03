# ADR-0003: Project documentation owned by the writing-documentation skill

- **Status:** Accepted | **Date:** 2026-06-03

## Context

haus generated `.haus-workflow/project.md` (a machine fact-sheet, `@`-imported into
CLAUDE.md every session) and `workflow-config.md` (commands + doc paths + tooling).
The `writing-documentation` skill — shipped as a default catalog skill — produces far
deeper, agent-operable docs (`CLAUDE.md` body, `docs/SUMMARY.md`, topic files). This
created three overlaps: both wrote/loaded repo facts, both touched `CLAUDE.md`, and the
skill's commands table duplicated `workflow-config.md`. `@`-imports are inlined, so
`project.md` cost full context every session for facts also in `context-map.json`.

## Decision

Split ownership by layer:

- **haus owns the workflow methodology**: `WORKFLOW.md` + a slimmed `workflow-config.md`
  (doc paths, the test commands the TDD/verification gate binds, highest-stakes logic,
  pre-commit tool). Commands/validation-library moved out.
- **The skill owns documentation**: a lean `CLAUDE.md` body (commands, conventions, PR
  checklist, a link to `docs/SUMMARY.md`) plus `docs/*` loaded on demand.
- **`project.md` is removed.** Facts live in `context-map.json`; prose lives in `docs/`.
- The CLAUDE.md `@`-import block carries only `WORKFLOW.md` + `workflow-config.md`. The
  skill preserves the `<!-- HAUS:BEGIN haus-imports -->` sentinels and writes around them.

The scanner remains the deterministic, headless classifier (CI/prepack/doctor); the
skill is the LLM documentarian, run last and seeded by `context-map.json`.

## Consequences

- Per-session context stays lean; deep docs load only when needed.
- One home per fact; no duplicated commands across `CLAUDE.md` and `workflow-config.md`.
- haus integration targets the skill's app mode; workspace mode stays manual (later stage).
- `doctor` no longer checks `project.md`; `write-project-facts.ts` is deleted.

## Alternatives considered

- **Keep `project.md`, slim it** — rejected; still duplicates `docs/SUMMARY.md` and loads every session.
- **Move commands into an `@`-imported file** — rejected; inlined imports give no context saving.
