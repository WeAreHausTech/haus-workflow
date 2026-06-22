# Architecture Decision Records

Write-once records of significant decisions. To change one, add a new ADR that
supersedes it. See `.claude/WORKFLOW.md` → "Architecture Decision Records".

Catalog-specific validation **policy** ADRs (e.g. npx waiver, upstream sync) live in
[`haus-workflow-catalog/docs/adr/`](https://github.com/WeAreHausTech/haus-workflow-catalog/tree/main/docs/adr);
this index covers CLI/repo decisions. ADR-0001 here links to those where the JSON is shared.

| ADR                                                    | Title                                                              | Status   |
| ------------------------------------------------------ | ------------------------------------------------------------------ | -------- |
| [0001](0001-validation-rules-single-source.md)         | Validation rules — single source in the catalog, synced to the CLI | Accepted |
| [0002](0002-binary-eligibility-recommender.md)         | Recommender uses binary eligibility (supersedes weighted scoring)  | Accepted |
| [0003](0003-documentation-owned-by-skill.md)           | Project documentation owned by the writing-documentation skill     | Accepted |
| [0004](0004-deep-context-feedback-loop.md)             | Deep comprehension feeds asset selection via deep-context.json     | Accepted |
| [0005](0005-cross-repo-contract-testing.md)            | Cross-repo contract testing between the CLI and the catalog        | Accepted |
| [0006](0006-ownership-marking-on-frontmatter-files.md) | Ownership marker moves inside frontmatter for skill files          | Accepted |
| [0007](0007-catalog-integrity-model.md)                | Catalog integrity — release tags, schema + content validation      | Accepted |
