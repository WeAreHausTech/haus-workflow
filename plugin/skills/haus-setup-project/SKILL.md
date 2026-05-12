---
name: haus-setup-project
description: Set up Haus AI workflow in the current project. Use when the user wants to configure Claude Code, scan a project, install relevant Haus skills, choose agents, set guardrails, or prepare an AI workflow for a repo.
---

# Haus Setup Project

## Use when

- user wants Haus workflow initialized in repo
- user wants guided or fast setup for Claude tooling

## Do not use when

- setup already applied and user asks only for coding task
- repo is not intended for Haus workflow installation

Start by asking:

"How do you want to set this project up?

1. Guided setup - I'll ask a few simple questions, then scan the project.
2. Fast setup - I'll only scan the project and recommend defaults."

## Guided setup

Ask plain-language questions only. Do not ask users to identify frameworks.

Then run:

```bash
haus scan --json
haus recommend --json
haus doctor
```

Ask before writing files.

Only after approval:

```bash
haus apply --write
haus doctor
```

## References

- `references/setup-modes.md`
