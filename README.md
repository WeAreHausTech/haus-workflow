# @haus/ai

Workflow control plane for Claude Code projects.  
Scans repo, recommends stack-fit skills/rules, writes safe `.claude/` + `.haus-ai/` outputs.

CLI command: `haus`  
Package: `@haus/ai`  
Runtime: Node `>=22`

> [!NOTE]
> No logo/icon found in repository. Header uses text-only format.

## Why Haus

- Auto-detects frameworks, package managers, monorepo shape, auth/db/test patterns.
- Produces explainable recommendations with confidence + skip reasons.
- Writes deterministic project setup with lockfile hashes for integrity checks.
- Enforces hook contract and security guardrails around risky actions.

## Install

```bash
npm install -g @haus/ai
haus --help
```

## Quick Start

Run inside target project root:

```bash
haus setup-project
haus scan --json
haus recommend --json
haus apply --dry-run
haus apply --write
haus doctor
```

Optional cleanup:

```bash
haus undo --yes
```

## Core Flow

### 1) Scan

`haus scan --json` writes:

- `.haus-ai/context-map.json`
- `.haus-ai/repo-summary.md`
- `.haus-ai/dependency-map.json`
- `.haus-ai/scan-hashes.json`

### 2) Recommend

`haus recommend --json` writes `.haus-ai/recommendation.json` with:

- `recommended[]` with reasons, confidence, and score
- `skipped[]` with skip reasons
- selected/skipped rule sets and token-reduction estimate

### 3) Apply

`haus apply --write` materializes selected assets into:

- `.claude/*`
- `.haus-ai/selected-context.json`
- `.haus-ai/haus.lock.json`

Each lock row hash fingerprints installed files under `paths`.  
`haus update` recomputes lock hashes after local edits.

## Explainability + Task Context

```bash
haus explain-context --json
haus explain-recommendation --json
haus context --task "create vendure shipping plugin" --json
```

Use these to audit why recommendations appeared and what context will be loaded for a specific task.

## Hook Contract

`plugin/hooks/hooks.json` is single source of truth.

- `haus apply --write` loads hook contract and writes `.claude/settings.json`
- apply performs post-write self-check for drift
- `haus doctor` / `haus doctor --hooks` validate project settings against contract

> [!WARNING]
> `HAUS_HOOKS_FALLBACK=1` exists for local dev recovery only. Do not use for shipped installs.

## Security Model

- Guard blocks sensitive file paths and dangerous shell commands.
- Redaction strips common secrets from memory/context outputs.
- Source adapters are curated; no silent auto-install behavior.

## Plugin + Sources

- Plugin commands: `haus plugin install`, `haus plugin validate`
- Source policy commands: `haus sources ...`
- Workspace bootstrap commands: `haus workspace init|scan`

## Developer Setup

```bash
corepack enable
yarn install
yarn build
yarn test
```

Local CLI run without global install:

```bash
node dist/cli.js scan --json
node dist/cli.js recommend --json
node dist/cli.js apply --dry-run
node dist/cli.js doctor
```

## Documentation

- [User guide (non-technical)](docs/user-guide.md)
- [Setup guide](docs/setup-guide.md)
- [CLI reference](docs/cli.md)
- [Architecture](docs/architecture.md)
- [Plugin details](docs/plugin.md)
- [Security notes](docs/security.md)
- [Product validation](docs/validation.md)
