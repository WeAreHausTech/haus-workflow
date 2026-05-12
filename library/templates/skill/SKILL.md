---
name: example-skill
description: Short router skill. Use only for scoped tasks.
---

# Example Skill

## Use when

- task clearly matches this skill scope
- required repo stack signals are present

## Do not use when

- task belongs to another stack
- broad workflow guidance would over-fetch context

## Router

1. Start with smallest relevant context.
2. Load only required references under `references/`.
3. Keep edits minimal and verifiable.
