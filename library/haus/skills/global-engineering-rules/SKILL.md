---
name: global-engineering-rules
description: Haus global engineering rules. Use only when selected by haus context scanning.
---

# Haus Global Engineering Rules

## Use when

- selected by recommender as baseline guardrail
- task needs deterministic quality and security boundaries

## Do not use when

- task explicitly targets unsupported stack/workflow

## Rules

- Use the detected project conventions.
- Keep changes small and production-oriented.
- Add or update tests for behavior changes.
- Never read secrets, private keys, dumps, production logs, uploads, or customer exports.
- State exactly what validation was run.
