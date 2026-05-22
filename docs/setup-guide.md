# Setup Guide

**New to the terminal?** Use the plain-language walkthrough: **[User guide](user-guide.md)** (install Haus, open your project, run setup, check health).

---

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

- Install CLI globally from a local checkout: `git clone https://github.com/WeAreHausTech/haus-ai-workflow.git && cd haus-ai-workflow && yarn install && yarn build && npm install -g .`
  (alternative: `yarn pack` and `npm install -g ./package.tgz`. The `haus` CLI is not yet published to npm.)
- Add Haus marketplace in Claude Code: `/plugin marketplace add github:WeAreHausTech/haus-ai-workflow` *(the repo is private — requires authenticated git access on your machine, e.g. SSH key or `gh auth login`)*
- Install plugin: `/plugin install haus-workflow@haus-marketplace`
- In project run: `haus setup-project`
- Validate hooks and guardrails by opening `.claude/settings.json`.
