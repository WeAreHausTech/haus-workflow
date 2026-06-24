# ADR 0007: Catalog integrity model

## Status

Accepted

## Context

The CLI fetches catalog content from `haus-workflow-catalog` at runtime. Branch
`main` is mutable (admins can bypass protection), and release tags are also
rewritable. Consumers cannot trust transport alone — validation must happen at
ingest time in the CLI.

## Decision

Layer integrity controls at the catalog ingest chokepoint:

1. **Release-tag tracking** — default ref resolves to the latest catalog release
   tag (not `main`). Override via `HAUS_CATALOG_REF` for pinning/tests.
2. **Schema validation** — `parseManifest()` rejects malformed manifests
   (including prototype-pollution keys and renamed required fields). Invalid
   manifests fall back to the bundled catalog with a warning.
3. **Content validation** — `validateCatalogItem()` applies ingest-time safety rules from
   the synced `validation-rules.json` fixture before cache write: risky-install patterns,
   the `npx tsx` allowlist (waived for `source: curated` — catalog
   [ADR-0005](https://github.com/WeAreHausTech/haus-workflow-catalog/blob/main/docs/decisions/0005-npx-tsx-exemption-for-curated-skills.md)),
   and forbidden stack tags in item prose. Structural checks (manifest schema, file
   existence, frontmatter) are catalog CI / `haus validate-catalog`; ingest runs the
   content-safety subset only.

Manifest top-level `version` is **required by ingest schema** (missing/empty fails
`parseManifest()`), but once accepted it is informational only (display/doctor) —
never a CLI compatibility gate. Breaking shape changes fail schema validation;
additive optional fields pass.

Cryptographic signing of manifests is **deferred**. Tags plus consumption-time
validation are the mitigation for now.

## Consequences

- Malicious or malformed upstream content cannot silently poison the cache.
- No hand-maintained `SUPPORTED_MANIFEST_MAJOR` constant.
- Catalog can ship independently of npm CLI releases when tagged.
- Signing, if added later, would be a new ADR superseding the deferred note above.
