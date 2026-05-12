# External Sources Policy

- No auto-install from public repos.
- Pin source, version/hash, license.
- Prefer Haus rewrites over copy.
- Unsupported stacks rejected.
- Unknown license -> candidate report only.
- Record accept/reject decisions in `library/curation/source-decisions.json`.
- Validate decisions with `yarn sources:decisions`.

See `docs/curation.md` for full gate criteria and review workflow.
