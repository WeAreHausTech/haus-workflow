# Validation Findings

Structured QA findings produced by following [docs/validation.md](../../../docs/validation.md).

Each file is one record. Two shapes share the validator (`scripts/validate-findings.ts`):

- `status: "issue"` — captured miss in recommendation or context quality
- `status: "clean"` — explicit zero-finding marker for a QA target

Findings feed the PR2-PR5 backlog. They are observational only; no runtime gating.

## Run the validator

```bash
yarn tsx scripts/validate-findings.ts
```
