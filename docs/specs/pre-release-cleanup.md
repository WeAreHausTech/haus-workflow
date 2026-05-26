# Pre-release cleanup checklist

Tracks code, scripts, library data, and docs that exist only as development scaffolding and must be removed (or revisited) before the **v0.1 publish (P10)**.

This file is the **source of truth** for the cleanup tracker. It is reconciled automatically against `HAUS-PRERELEASE-CLEANUP: <reason>` markers in the codebase (in any of the supported comment forms — see "Marker convention" below) by `yarn cleanup:status`.

## Marker convention

Place a marker on a line owned by the dev-only construct (top of file is fine for whole-file deletions):

| File type | Marker |
|---|---|
| `.ts` / `.js` / `.tsx` | `// HAUS-PRERELEASE-CLEANUP: <one-line reason>` |
| `.yml` / shell / JSON-with-comments | `# HAUS-PRERELEASE-CLEANUP: <one-line reason>` |
| pure `.json` | inert top-level key: `"_haus_cleanup": "HAUS-PRERELEASE-CLEANUP: <one-line reason>"` |
| `.md` (no frontmatter) | `<!-- HAUS-PRERELEASE-CLEANUP: <one-line reason> -->` anywhere in the file |
| `.md` with YAML frontmatter | `# HAUS-PRERELEASE-CLEANUP: <one-line reason>` on its own line **inside** the `---` block — keeps `---` as the true first line so frontmatter parsers don't break |

The marker reason is free-form. Keep it short and reference the phase (e.g. "P4a — sources subsystem removal").

## Spec entries

Each cleanup target must have **one row per file** below, in this format:

```
- [ ] `<repo-relative-path>` — <one-line reason / phase reference>
```

Use `- [x]` when the cleanup is complete *and* the file has been deleted in the same PR. Checked rows should be deleted in the cleanup PR (don't leave checked rows behind — empty spec is the goal at v0.1).

## Reconciliation rules

`yarn cleanup:status` reports three states:

- **OK** — file is in spec and has at least one marker. Pair intact.
- **MISSING_SPEC** — marker found in a file with no matching spec row. Add a row here.
- **ORPHAN_SPEC** — spec row exists but no marker found in that file. Either re-add the marker or delete the row.

Exit code is always 0 (non-blocking until P10 makes it blocking).

## Markers

<!-- Add rows below this line. Format: - [ ] `<path>` — <reason> -->

### P4a — sources subsystem

- [ ] `src/sources/github-source.ts` — P4a sources subsystem removal.
- [ ] `src/sources/load-sources.ts` — P4a sources subsystem removal.
- [ ] `src/sources/prpm-source.ts` — P4a sources subsystem removal.
- [ ] `src/sources/skillkit-source.ts` — P4a sources subsystem removal.
- [ ] `src/sources/skills-sh-source.ts` — P4a sources subsystem removal.
- [ ] `src/sources/source-audit.ts` — P4a sources subsystem removal.
- [ ] `src/sources/source-report.ts` — P4a sources subsystem removal.
- [ ] `src/sources/types.ts` — P4a sources subsystem removal.
- [ ] `src/commands/sources.ts` — P4a CLI `haus sources *` commands removed.
- [ ] `scripts/audit-sources.ts` — P4a audit script removed.
- [ ] `scripts/validate-source-decisions.ts` — P4a source-decisions validator removed.

### P4b — curation + library audit artifacts

- [ ] `src/curation/unsupported-stack-mention.ts` — P4b curation module removed.
- [ ] `scripts/audit-curated.ts` — P4b curated audit removed.
- [ ] `scripts/library-audit.ts` — P4b library audit removed.
- [ ] `scripts/verify-no-unsupported-tech.ts` — P4b catalog audit removed.
- [ ] `scripts/validate-findings.ts` — P4b findings validator removed.
- [ ] `library/curated/README.md` — P4b covers deletion of entire `library/curated/` directory.
- [ ] `library/curation/README.md` — P4b covers deletion of entire `library/curation/` directory.
- [ ] `tests/curated-schema.test.js` — P4b paired with library/curated removal.
- [ ] `tests/curation-schema.test.js` — P4b paired with library/curation removal.
- [ ] `tests/fixtures/findings/README.md` — P4b covers deletion of entire `tests/fixtures/findings/` (validate-findings fixtures).

### P4c — collapse explainability

- [ ] `src/commands/explain-context.ts` — P4c collapse to single explainability command; `explain-recommendation` survives.
- [ ] `tests/context-explain.test.js` — P4c paired with explain-context removal.

### P4e — `plugin/` directory removal

- [ ] `plugin/.claude-plugin/plugin.json` — P4e plugin manifest removed.
- [ ] `plugin/hooks/hooks.json` — P4e plugin hooks removed; P5 merges hook entries into `~/.claude/settings.json`.
- [ ] `plugin/agents/haus-code-reviewer.md` — P4e moves to `library/global/agents/` in P5.
- [ ] `plugin/agents/haus-docs-researcher.md` — P4e moves to `library/global/agents/` in P5.
- [ ] `plugin/agents/haus-planner.md` — P4e moves to `library/global/agents/` in P5.
- [ ] `plugin/agents/haus-security-reviewer.md` — P4e moves to `library/global/agents/` in P5.
- [ ] `plugin/agents/haus-test-reviewer.md` — P4e moves to `library/global/agents/` in P5.
- [ ] `plugin/skills/haus-context-router/SKILL.md` — P4e skill outsourced to catalog (P7).
- [ ] `plugin/skills/haus-context-router/references/context-minimization.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-context-router/references/task-intents.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-documentation-maintainer/SKILL.md` — P4e skill outsourced to catalog (P7).
- [ ] `plugin/skills/haus-documentation-maintainer/references/documentation-checklist.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-documentation-maintainer/references/documentation-style.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-global-engineering-rules/SKILL.md` — P4e skill outsourced to catalog (P7).
- [ ] `plugin/skills/haus-global-engineering-rules/references/change-discipline.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-global-engineering-rules/references/security-posture.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-global-engineering-rules/references/tests-and-validation.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-setup-project/SKILL.md` — P4e rebranded as new `haus-workflow` skill in `library/global/skills/` (P5).
- [ ] `plugin/skills/haus-setup-project/references/setup-modes.md` — P4e relocates with parent skill in P5.
- [ ] `plugin/skills/haus-skill-author/SKILL.md` — P4e skill outsourced to catalog (P7).
- [ ] `plugin/skills/haus-skill-author/references/router-vs-manual.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-skill-author/references/skill-authoring-rules.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-workflow/SKILL.md` — P4e old workflow skill outsourced to catalog (P7); the new `haus-workflow` is a rebrand of `haus-setup-project`.
- [ ] `plugin/skills/haus-workflow/references/safe-change-checklist.md` — P4e outsourced with parent skill.
- [ ] `plugin/skills/haus-workflow/references/verification-loop.md` — P4e outsourced with parent skill.
- [ ] `tests/core-skill-shape.test.js` — P4e tests plugin skill shape; replaced by tests over `library/global/skills/` in P5.
