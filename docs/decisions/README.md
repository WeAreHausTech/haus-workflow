# Architecture Decision Records

Write-once records of significant decisions. To change one, add a new ADR that
supersedes it. See `.haus-workflow/WORKFLOW.md` → "Architecture Decision Records".

Catalog-specific validation **policy** ADRs (e.g. npx waiver, upstream sync) live in
[`haus-workflow-catalog/docs/decisions/`](https://github.com/WeAreHausTech/haus-workflow-catalog/tree/main/docs/decisions);
this index covers CLI/repo decisions. ADR-0001 here links to those where the JSON is shared.

| ADR                                                              | Title                                                                   | Status   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](0001-validation-rules-single-source.md)                   | Validation rules — single source in the catalog, synced to the CLI      | Accepted |
| [0002](0002-binary-eligibility-recommender.md)                   | Recommender uses binary eligibility (supersedes weighted scoring)       | Accepted |
| [0003](0003-documentation-owned-by-skill.md)                     | Project documentation owned by the writing-documentation skill          | Accepted |
| [0004](0004-deep-context-feedback-loop.md)                       | Deep comprehension feeds asset selection via deep-context.json          | Accepted |
| [0005](0005-cross-repo-contract-testing.md)                      | Cross-repo contract testing between the CLI and the catalog             | Accepted |
| [0006](0006-ownership-marking-on-frontmatter-files.md)           | Ownership marker moves inside frontmatter for skill files               | Accepted |
| [0007](0007-catalog-integrity-model.md)                          | Catalog integrity — release tags, schema + content validation           | Accepted |
| [0008](0008-adr-enforcement-heuristics.md)                       | Decision gate heuristics and `decisions-triggers.json`                  | Accepted |
| [0009](0009-llms-txt-reference-fetching.md)                      | llms.txt reference fetching and local cache                             | Accepted |
| [0010](0010-supply-chain-hardening.md)                           | Supply-chain hardening — fail-closed defaults and defence-in-depth      | Accepted |
| [0011](0011-consolidate-commands-into-haus-workflow-skill.md)    | Consolidate haus-\* commands into the haus-workflow skill               | Accepted |
| [0012](0012-local-pre-pr-decisions-guard-hook.md)                | Local pre-PR decisions guard hook (`decisions guard`)                   | Accepted |
| [0013](0013-catalog-v3-4-agent-skills-alignment-fixture.md)      | Catalog v3.4.0 fixture sync — agent-skills-library alignment            | Accepted |
| [0014](0014-cli-audit-remediation-scope-and-approach.md)         | CLI audit remediation — scope, deletion policy, module split            | Accepted |
| [0015](0015-catalog-former-ids-lock-migrate.md)                  | Catalog formerIds → lock migrate on update/apply                        | Accepted |
| [0016](0016-cli-audit-sections-3-4-scope-and-approach.md)        | CLI audit sections 3 & 4 — workspace undo scope, check-tier honesty     | Accepted |
| [0017](0017-apply-prune-safety-model.md)                         | `haus apply --prune` — opt-in deletion, hash-gated, backed up first     | Accepted |
| [0018](0018-clone-conflict-and-menu-pagination.md)               | Clone conflict detection, menu pagination, clone mode prompt            | Accepted |
| [0019](0019-haus-backups-restore-safety-model.md)                | `haus backups` restore safety — no symlink-follow, no unbounded prune   | Accepted |
| [0020](0020-ci-gate-aggregation-model.md)                        | `haus ci-gate` — aggregate three commands without changing contracts    | Accepted |
| [0021](0021-dry-run-diff-symlink-refusal.md)                     | Dry-run diff for catalog items — never follow a symlink into preview    | Accepted |
| [0022](0022-recommender-gate-breakdown-near-miss.md)             | Recommender gate-breakdown schema and near-miss semantics               | Accepted |
| [0023](0023-catalog-github-api-auth-rate-limit-ux.md)            | Catalog GitHub API auth resolution and rate-limit UX                    | Accepted |
| [0024](0024-cross-repo-validator-behavior-parity.md)             | Cross-repo validator behavior-parity check (live sibling checkout)      | Accepted |
| [0025](0025-untrack-machine-local-scan-artifacts.md)             | Untrack machine-local scan artifacts — gitignore-writer + migration     | Proposed |
| [0026](0026-workspace-member-config-bridge-not-consolidation.md) | Workspace member config — bridge repos.manifest.json, don't consolidate | Proposed |
