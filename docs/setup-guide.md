# Setup Guide

Run `haus setup-project`.

- Guided mode asks plain-language questions.
- Fast mode scans only.
- Review output, then approve `haus apply --write`.

## Local testing in Cursor (without Claude Code)

```bash
yarn build
node dist/cli.js scan --json
node dist/cli.js recommend --json
node dist/cli.js apply --dry-run
node dist/cli.js doctor
```

## Later testing in Claude Code

- Install package globally: `npm install -g @haus/ai`
- Run plugin install: `haus plugin install`
- In project run: `haus setup-project`
- Validate hooks and guardrails by opening `.claude/settings.json`.
