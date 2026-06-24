# ADR-0006: Ownership marking on frontmatter files

- **Status:** Accepted | **Date:** 2026-06-09

## Context

`haus install` seeds skills and commands into `~/.claude/` from `library/global/`. Every
installed Markdown file is stamped with an ownership marker (`stampMarkdown` in
`src/install/header.ts`) so re-install can detect haus-owned vs user-owned files, track
the source version, and avoid clobbering user edits.

The marker was always written as an HTML comment on **line 1**:

```
<!-- HAUS-MANAGED id=skill.haus-workflow v=1 source=@haus-tech/haus-workflow@0.16.2 -->
```

This is correct for plain Markdown docs (e.g. `WORKFLOW.md`). It is **wrong** for Claude
Code skills: a skill's `SKILL.md` must open with YAML frontmatter (`---`) on line 1, and
the `name`/`description` it carries are what register the skill. An HTML comment above the
`---` is illegal frontmatter — Claude Code/Desktop then parse a garbage description and
the skill body no longer drives behaviour (observed: `/haus-workflow` with no task did not
show its `AskUserQuestion` menu in Desktop).

A comment line above frontmatter and valid line-1 frontmatter cannot coexist. The two
requirements collide on exactly the files that use frontmatter (skills today; any command
that opts into a `description` later).

## Decision

When a managed file **begins with a `---` frontmatter block**, embed the ownership marker
as a field **inside** that block instead of as a top-line HTML comment:

```
---
name: haus-workflow
description: ...
haus_managed: "id=skill.haus-workflow v=1 source=@haus-tech/haus-workflow@0.16.2"
---
```

Line 1 stays `---`, so the skill registers correctly with a real description. The marker
remains machine-readable, so ownership detection and version tracking survive. Plain docs
with no leading `---` keep the existing top-line HTML comment form unchanged.

`parseMarkdownHeader` recognises **both** forms and returns the same `HausHeader`.
`stampMarkdown` routes by content shape and is idempotent (re-stamp replaces the existing
marker, never duplicates it, never pushes frontmatter off line 1).

## Consequences

- Skills install with valid frontmatter; descriptions are correct; bodies drive behaviour.
- Ownership/version detection in `src/install/apply.ts` (refuse-to-overwrite, drift,
  orphan deletion) continues to work for both forms via `parseMarkdownHeader`.
- The existing `tests/frontmatter-integrity.test.js` invariant ("no `HAUS-MANAGED` on
  line 1 of a skill") is preserved and extended to the global install path.
- Source `SKILL.md` files in `library/global/` carry no hand-written marker — the marker
  is injected at install time, single-sourced from `package.json` version.

## Alternatives considered

- **Copy skills verbatim, manifest-only ownership.** Matches the recommender/project path
  and is smaller, but loses the inline ownership signal `parseMarkdownHeader` relies on at
  `src/install/apply.ts` for the refuse-to-overwrite guard; would need a manifest-presence
  fallback and weakens drift detection for hand-copied files. Rejected for the larger
  ownership-logic change.
- **Status quo with the stray `##`/comment removed but the HTML header still on top.**
  Still illegal — any line above `---` breaks frontmatter. Rejected.
