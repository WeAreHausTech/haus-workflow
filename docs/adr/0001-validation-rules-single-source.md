# ADR-0001: Validation rules — single source in the catalog, synced to the CLI

- **Status:** Accepted | **Date:** 2026-06-02

## Context

Catalog validation rules (forbidden stack tags, banned agent phrases, required
markdown sections, risky-install regexes, and the stack tag allowlist) were
maintained as **parallel constants in two languages**:

- `haus-workflow/src/catalog/validation-rules.ts` (CLI, TypeScript)
- `haus-workflow-catalog/scripts/validation-rules.mjs` (catalog, JavaScript)

Both files carried a "SYNC REQUIRED — update the other too" header. Manual sync
is a silent-divergence hazard: the CLI can enforce stale rules against a catalog
that has already moved on.

A second, sharper divergence existed in the **tag allowlist**. The CLI's
`validate-catalog` enforced an allowlist (`library/catalog/allowed-stacks.json`
plus a hardcoded set of "always allowed" meta tags), while the catalog's own
`scripts/validate.mjs` enforced only the *denylist* (`FORBIDDEN_TAGS`). A catalog
author could add a tag that passed local `yarn validate` but failed the CLI's
stricter CI check — exactly what happened during WS1 (`pre-commit`/`lefthook`/
`config` tags). Worse, the CLI itself had **two** allowlist evaluators with
*different* special-tag lists (`src/catalog/validate-catalog.ts`, which was dead
code, and `src/commands/validate-catalog.ts`).

The allowlist (`allowed-stacks.json`) deliberately lived in the CLI package, "not
in the catalog repo", so the catalog would not restrict its own authoring. WS1
proved that reasoning backwards: the catalog *should* be restricted locally,
because it ships the tags the CLI later rejects.

## Decision

1. **One canonical data file owned by the catalog:** `validation-rules.json` at
   the catalog repo root. It holds every rule value — including the stack
   allowlist (`allowedStacks`), the always-allowed meta tags
   (`alwaysAllowedTags`), and the pattern-tag suffixes (`patternTagSuffixes`).
   Regexes are stored as `{ source, flags }` records and reconstructed by the
   loaders.

2. **The CLI receives it as a synced fixture** at
   `library/catalog/validation-rules.json` — the same mechanism already proven
   for `manifest.json` (catalog `dispatch-fixture-sync` → CLI
   `sync-catalog-fixture` opens a PR). This **reverses** the prior "allowlist
   lives in the CLI" choice; the catalog is now the source of truth for what
   tags are valid, consistent with it being the source of truth for `manifest.json`.

3. **Both validators become thin loaders** of that JSON and share one allowlist
   evaluator (`isTagAllowed` / `auditDisallowedTags`), mirrored in each language.
   The catalog's `validate.mjs` now enforces the allowlist too, so local and CI
   checks agree. The dead CLI lib evaluator and `allowed-stacks.json` are deleted.

4. **Two CI backstops** guard against drift the JSON can't prevent on its own:
   the fixture-sync PR flow (CLI fixture follows catalog `main`), and a
   `validate.mjs` check that `.claude/WORKFLOW.md` stays byte-identical to
   `templates/agentic-workflow-standard.md`.

## Consequences

- Editing a rule means editing **one** JSON file. No language port, no "update
  the other file" ritual.
- A catalog author runs the *same* allowlist check locally that CI enforces; the
  WS1 class of drift cannot recur.
- The CLI bundles the rules at build time (static JSON import). Validation is
  release-coupled by design — unlike catalog *content*, which is fetched at
  runtime. A rule change reaches the CLI via the fixture-sync PR, then a release.
- The CLI no longer has a runtime `readAllowedStacks(root)` seam; the allowlist
  is part of the bundled rules.

## Alternatives considered

- **CLI owns canonical, catalog syncs back.** Rejected: reverses the normal
  catalog→CLI sync direction for one file, inconsistent with `manifest.json`.
- **Keep two files + a CI divergence check only.** Rejected: still two languages
  to edit; the check catches drift after the fact instead of removing the source
  of it.
- **Leave the allowlist asymmetry alone (constants-only merge).** Rejected: the
  allowlist drift was the concrete failure (WS1), so the fix must cover it.
