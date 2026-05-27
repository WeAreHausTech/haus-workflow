# Changelog

All notable changes are documented here.

## [0.1.0] — 2026-05-27

First public release of `@haus-tech/haus-workflow`.

### Architecture pivot: plugin → global npm install

The Claude Code plugin model (`/plugin marketplace add`) was replaced with a globally-installed npm package that seeds `~/.claude/` directly:

```bash
npm install -g @haus-tech/haus-workflow
haus install   # seeds ~/.claude/ with HAUS-MANAGED skills, agents, hooks
```

All plugin artifacts (`plugin/`, `.claude-plugin/`) removed. Skills and agents now live under `library/global/` and are written to `~/.claude/` with HAUS-MANAGED headers for deterministic update and uninstall.

### What's included

- **`haus init`** — first-run project setup
- **`haus scan`** — repo detection → `.haus-workflow/context-map.json`
- **`haus recommend`** — stack-fit catalog scoring → `.haus-workflow/recommendation.json`
- **`haus apply`** — writes `.claude/` files from recommendations and catalog cache
- **`haus update`** — lockfile refresh + remote catalog sync + npm version check
- **`haus doctor`** — health check: hooks, CLAUDE.md import block, catalog cache age
- **`haus install` / `haus uninstall`** — seed / remove HAUS-MANAGED files in `~/.claude/`
- **`haus memory`** — local-only redacted memory store
- **`haus context`** — task-scoped context assembly
- **Remote catalog** — `haus update` fetches `manifest.json` + skill/agent content from `wearehaustech/haus-workflow-catalog`; offline fallback to bundled catalog

### Breaking changes from pre-release

- Package renamed: `haus` → `@haus-tech/haus-workflow`
- Binary unchanged: `haus`
- Plugin install steps removed; replace with `npm install -g @haus-tech/haus-workflow && haus install`
- `.haus-ai/` directory renamed to `.haus-workflow/` (P2b — migration required for existing setups)
