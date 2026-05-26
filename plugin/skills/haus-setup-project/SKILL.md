---
# HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5.
name: haus-setup-project
description: Set up Haus AI workflow in the current project. Use when the user wants to configure Claude Code, scan a project, install relevant Haus skills, choose agents, set guardrails, or prepare an AI workflow for a repo.
---

# Haus Setup Project

## Use when

- user wants Haus workflow initialized in repo
- user wants guided or fast setup for Claude tooling

## Do not use when

- setup already applied and user asks only for a coding task
- repo is not intended for Haus workflow installation

## Conversation flow

Start with:

> "I'll help you set up Haus AI for this project. Do you want me to walk you through it with a few questions, or just scan and apply sensible defaults right away?"

- **Walk me through it** → Guided setup
- **Scan and apply defaults** → Fast setup

## Guided setup

Ask one question at a time. Do not ask users to identify framework names — infer from scan output. Good questions: what they build, who uses it, any areas to avoid.

Then run the scan, summarize in plain language, show the diff, and ask:

> "Should I go ahead and write these files?"

Only after explicit approval, run apply and confirm success.

## Fast setup

Run scan and recommend, show a brief summary, then ask for approval before writing.

## Commands

```bash
haus scan --json
haus recommend --json
haus doctor
# after approval:
haus apply --write
haus doctor
```

If `haus` commands fail: install the CLI from a clone of `haus-workflow` (`yarn install && yarn build && npm install -g .`) and retry. The CLI is not on npm.

## References

- `references/setup-modes.md`