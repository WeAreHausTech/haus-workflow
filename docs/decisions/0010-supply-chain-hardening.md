# ADR 0010: Supply-chain hardening — fail-closed defaults and defence-in-depth

## Status

Accepted

## Context

A deep audit (2026-06-30) identified several places where the CLI trusted external
catalog data without adequate defence-in-depth: tag resolution fell back silently to
`main`, apply-time validation covered only the primary skill file, recommender policy
gates used substring matching (allowing `java` to trigger on `javascript`), and source
trust was read from a stale on-disk report rather than live item metadata. In aggregate
these weaknesses meant a poisoned or compromised cache, a forced push to `main`, or a
subtle tag-matching bypass could silently install unsafe content or leak context assets.

## Decision

Apply fail-closed defaults and defence-in-depth across the supply chain:

1. **Fail-closed ref resolution (A1)** — tag-resolution failure falls back to the
   cached/bundled ref with a loud warning instead of silently using `main`. The
   mutable `main` branch is never a silent fallback target.

2. **Apply-time full-directory validation (A2)** — all `*.md` files under a cached
   skill directory are validated against `validation-rules.json` before copy to
   `.claude/`. Previously only `SKILL.md` was checked; other markdown files (e.g.
   README inside the skill dir) could carry risky patterns through unexamined.

3. **Exact-tag gates (A3)** — UNSUPPORTED/FORBIDDEN policy gates use exact whole-word
   matching (`\bjava\b`) instead of substring includes, preventing `javascript` from
   triggering the `java` gate.

4. **Live source-trust derivation (A4)** — recommender derives source trust from
   `item.reviewStatus` in the live catalog, not from the stale on-disk
   `sources-report.json`, which could diverge from catalog reality.

5. **Test-mode gating for `HAUS_CATALOG_REMOTE_BASE` (A6)** — the env-var override
   for the catalog remote origin is only honoured in `HAUS_TEST_MODE=1`, closing the
   path where a compromised environment variable could redirect fetches to an attacker-
   controlled host in production.

6. **Legacy header migration (A8)** — managed-template headers without a hash field
   (from pre-hash CLI versions) are now migrated on apply instead of skipped. Skipping
   left managed blocks untracked and tamper-detectable only by hash-bearing copies.

## Consequences

- Any CI job touching a catalog fetch now requires `HAUS_TEST_MODE=1` to use a custom
  remote base, which is the correct pattern (see `scripts/run-tests.mjs`).
- Skills with any markdown file carrying a risky-install pattern are blocked at apply
  time. Legitimate patterns must be waived via `validation-rules.json` before release.
- Source trust decisions are always current with catalog state; no separate
  `sources-report.json` flush step is needed to reflect upstream changes.
- The `[adr-skip]` escape hatch remains available for trivial cleanup commits that the
  heuristic over-triggers on (see ADR-0008).

## Alternatives considered

- **Cryptographic signing of manifests** — deferred (see ADR-0007); considered too
  heavy for the current threat model and team size.
- **Allowlist of approved skill directory files** — rejected in favour of validating
  all markdown, since the allowlist would need maintenance as skill structure evolves.
- **Subprocess sandbox for apply-time validation** — out of scope; validation-rules
  content-safety checks are sufficient for the current risk surface.
