# Source Curation

External sources are **inspiration** or **reference** inputs. Shipped content is Haus-owned and rewritten.

Workflow:

1. Study external source.
2. Extract reusable idea.
3. Gate against product constraints.
4. Rewrite into Haus-owned skill, reference, agent, or rule text.
5. Record accept or reject in `source-decisions.json` (one `target` file per accepted row).
6. Run `yarn sources:decisions`, `yarn library:audit`, and product audits or tests.

Rules:

- Never copy external skills verbatim.
- Never auto-sync upstream prompts into shipping assets.
- Never add marketplace, registry, or orchestration runtime behavior.
- Never ship unsupported stack workflows.
- Keep accepted ideas attributable and maintainable.

Accepted ideas must record:

- what idea is accepted
- why Haus wants it
- where it lands (`target`)
- `copied: false`
- maintenance risk
- license or attribution concern (for audit; public OSS is often low concern)
- product fit

## Discovery indexes (e.g. skills.sh)

Public **discovery** listings are **candidate** inspiration: useful to find leads, **not** catalog truth. Do not auto-import rows into `library/catalog/manifest.json`. Every catalog entry still needs explicit Haus review.

## Machine-readable decisions (Skillkit-style discipline)

- **Schema:** `source-decisions.schema.json` describes the shape of `source-decisions.json`.
- **Gate:** `yarn sources:decisions` runs `scripts/validate-source-decisions.ts` against the committed JSON and `library/catalog/sources.yaml`.
- **Library:** `yarn library:audit` checks catalog-backed files under `library/` plus markdown policy under `library/haus/`.

That pairing gives reproducible audits without wiring any external packaging product into install or apply.
