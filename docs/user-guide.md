# Haus AI User Guide

This guide shows how to use `haus` in a real project, even if you are not a developer.

## What Haus AI does

Haus AI scans your project, recommends context files/rules, then writes controlled files so Claude works with safer, stack-aware guidance.

Main output folders:

- `./.claude` (Claude settings/rules/commands)
- `./.haus-ai` (scan/recommendation/lock/memory metadata)

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

`haus` is not published to npm yet. Install it from a clone of the
[haus-ai-workflow](https://github.com/WeAreHausTech/haus-ai-workflow) repo.

**Primary: global link from checkout**

```bash
git clone https://github.com/WeAreHausTech/haus-ai-workflow.git
cd haus-ai-workflow
yarn install
yarn build
npm install -g .     # uses npm to symlink the `haus` bin globally
haus --help
```

**Alternative: install from a packed tarball**

```bash
yarn install
yarn build
yarn pack            # produces package.tgz
npm install -g ./package.tgz
```

If global install is not allowed, run the CLI directly from the checkout:

```bash
yarn install
yarn build
node dist/cli.js --help
```

### If you switch Node versions often (nvm, Herd, Volta…)

`npm install -g .` only installs `haus` into the currently active Node version's bin. Switch Node → `haus` disappears. Two options:

1. **Re-install per version.** When you change Node, either run `npm install -g .` again from the checkout, or carry globals forward when adding a new Node version:
   ```bash
   nvm install <new-version> --reinstall-packages-from=current
   ```

2. **Use a shell alias that resolves to whatever Node is active.** No per-version install needed:
   ```bash
   echo 'alias haus="node /absolute/path/to/haus-ai-workflow/dist/cli.js"' >> ~/.zshrc
   source ~/.zshrc
   haus --help
   ```
   Use this if you switch Node versions frequently.

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

Writes project detection outputs to `./.haus-ai/*`.

### 2) Generate recommendations

```bash
haus recommend --json
```

Creates `./.haus-ai/recommendation.json` with selected and skipped items, confidence, and reasons.

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

`--hooks` checks that project hook settings still match shipped plugin hook contract.

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
- backs up lockfile under `./.haus-ai/backups`
- prints unified lockfile diff summary

## Memory commands

```bash
haus memory status
haus memory add "Use explicit transaction boundaries in checkout service"
haus memory inject --task "review checkout flow"
haus memory promote
```

Memory is local-only in `./.haus-ai/memory`.

## Explain/context commands

Use when you need to understand why rules were selected:

```bash
haus explain-context --json
haus explain-recommendation --json
haus context --task "build shipping plugin" --json
```

## Claude slash-command usage

After `haus apply --write`, command docs are generated in:

- `./.claude/commands/haus-doctor.md`
- `./.claude/commands/haus-review.md`
- `./.claude/commands/haus-explain-context.md`

Some environments expose these as slash commands. If not, run the CLI commands directly.

## Plugin commands

Install the Claude Code plugin via Claude Code's `/plugin` system (not via `haus`):

```bash
# Add Haus marketplace (once per machine)
/plugin marketplace add github:WeAreHausTech/haus-ai-workflow

# Install plugin
/plugin install haus-workflow@haus-marketplace
```

> **Note:** The GitHub repo is **private**. The `marketplace add` step needs authenticated git access on your machine (SSH key with repo access, or `gh auth login`). Without auth, the marketplace fetch will fail.

Validate the local plugin structure:

```bash
haus plugin validate
```

## If something fails

- `haus: command not found` -> reinstall globally or use local `node dist/cli.js ...`
- `npm install -g .` fails with `EEXIST` at `.../bin/haus` -> a stale symlink (often from a previous `yarn link`) is in the way. Remove it and retry: `rm "<path-from-error>" && npm install -g .`
- Node engine error -> switch to Node 22+
- hook mismatch in doctor -> run `haus apply --write` again
- wrong project scanned -> `cd` into correct project root, rerun

## Remove generated setup

```bash
haus undo --yes
```

Removes `./.claude` and `./.haus-ai` in current project.
