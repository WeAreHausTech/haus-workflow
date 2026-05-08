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
