# Source Curation

External sources are inspiration only. Shipped content is Haus-owned.

Workflow:

1. Study external source.
2. Extract reusable idea.
3. Gate against product constraints.
4. Rewrite into Haus-owned skill/reference/agent/rule guidance.
5. Record accept/reject decision in `source-decisions.json`.
6. Validate decisions and run product audits/tests.

Rules:

- Never copy external skills verbatim.
- Never auto-sync upstream prompts into shipping assets.
- Never add marketplace/runtime orchestration behavior.
- Never ship unsupported stack workflows.
- Keep accepted ideas attributable and maintainable.

Accepted ideas must record:

- what idea is accepted
- why Haus wants it
- where it lands (`target`)
- `copied: false`
- maintenance risk
- license/attribution concern
- product fit
