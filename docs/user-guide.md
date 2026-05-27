# Haus AI User Guide

This guide shows how to use `haus` in a real project, even if you are not a developer.

## What Haus AI does

Haus AI scans your project, recommends context files/rules, then writes controlled files so Claude works with safer, stack-aware guidance.

Main output folders:

- `./.claude` (Claude settings/rules/commands)
- `./.haus-workflow` (scan/recommendation/lock/memory metadata)

## Before you start

You need:

- a project folder on your machine
- Node.js 22+ (`node --version`)
- terminal access

Check Node:

```bash
node --version
```

If version is below 22, install/update Node first.

## Install Haus AI

```bash
npm install -g @haus-tech/haus-workflow
haus --help
```

Seed `~/.claude/` with Haus skills, agents, and hooks (once per machine):

```bash
haus install
```

### If you switch Node versions often (nvm, Herd, Volta…)

`npm install -g` binds to the currently active Node version. Switch Node → `haus` disappears. Two options:

1. **Re-install per version.** When you change Node, carry globals forward:
   ```bash
   nvm install <new-version> --reinstall-packages-from=current
   ```

2. **Use a shell alias.** No per-version install needed:
   ```bash
   echo 'alias haus="node $(npm root -g)/@haus-tech/haus-workflow/dist/cli.js"' >> ~/.zshrc
   source ~/.zshrc
   ```

## Use Haus in a project

Move terminal to project root (folder that contains your app code), then run:

```bash
haus setup-project
```

Setup modes:

- guided: asks simple onboarding questions
- fast: minimal prompts, default flow

## Typical daily workflow

### 1) Scan project

```bash
haus scan --json
```

Writes project detection outputs to `./.haus-workflow/*`.

### 2) Generate recommendations

```bash
haus recommend --json
```

Creates `./.haus-workflow/recommendation.json` with selected and skipped items, confidence, and reasons.

### 3) Preview generated changes

```bash
haus apply --dry-run
```

Shows planned files without writing.

### 4) Apply generated files

```bash
haus apply --write
```

Writes generated files and reports overwrite summaries with concise diff counts.

### 5) Verify setup health

```bash
haus doctor
haus doctor --hooks
```

`--hooks` checks that project hook settings still match the hook contract.

## Update flow

Check update state:

```bash
haus update --check
```

Apply lock refresh:

```bash
haus update
```

Update behavior:

- preserves local `.claude` overrides
- backs up lockfile under `./.haus-workflow/backups`
- prints unified lockfile diff summary

## Memory commands

```bash
haus memory status
haus memory add "Use explicit transaction boundaries in checkout service"
haus memory inject --task "review checkout flow"
haus memory promote
```

Memory is local-only in `./.haus-workflow/memory`.

## Explain/context commands

Use when you need to understand why rules were selected:

```bash
haus explain-recommendation --json
haus context --task "build shipping plugin" --json
```

## Claude slash-command usage

After `haus apply --write`, command docs are generated in:

- `./.claude/commands/haus-doctor.md`
- `./.claude/commands/haus-review.md`

Some environments expose these as slash commands. If not, run the CLI commands directly.

## If something fails

- `haus: command not found` -> run `npm install -g @haus-tech/haus-workflow` or check Node version
- Node engine error -> switch to Node 22+
- hook mismatch in doctor -> run `haus apply --write` again
- wrong project scanned -> `cd` into correct project root, rerun

## Remove generated setup

```bash
haus undo --yes
```

Removes `./.claude` and `./.haus-workflow` in current project.
