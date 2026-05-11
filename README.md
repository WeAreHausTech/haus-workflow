# @haus/ai

Haus-owned workflow orchestrator for Claude Code.

CLI command: `haus`  
Package name: `@haus/ai`  
Project metadata dir: `.haus-ai/`

## Install

```bash
npm install -g @haus/ai
```

## Core flow

```bash
haus setup-project
haus scan --json
haus recommend --json
haus apply --dry-run
haus apply --write
haus doctor
```

## Guided vs fast

- Guided: asks non-technical project intent questions, then scans and recommends.
- Fast: scanner-only defaults for quick onboarding.

## Scanner -> recommend -> apply

1. `haus scan --json` writes `.haus-ai/context-map.json`, `.haus-ai/repo-summary.md`, `.haus-ai/dependency-map.json`, `.haus-ai/scan-hashes.json`.
2. `haus recommend --json` writes `.haus-ai/recommendation.json` with selected/skipped reasons.
3. `haus apply --write` generates selected `.claude/*` + `.haus-ai/haus.lock.json`.

Hook entries in `.claude/settings.json` come from [`plugin/hooks/hooks.json`](plugin/hooks/hooks.json) (strict load on apply; use `HAUS_HOOKS_FALLBACK=1` only for broken local dev trees). Apply self-checks the written file against that contract. Use `haus doctor` or `haus doctor --hooks` to detect drift. Each lock row’s `hash` fingerprints installed files under `paths`; `version` is the `@haus/ai` package version that ran apply. Run `haus update` to recompute hashes after local edits to tracked files.

## Security

- Guard blocks sensitive file access and dangerous shell commands.
- Memory is local-first and redacts obvious secrets.
- Source adapters are curated and non-auto-install.
