**A4 — End-to-end plugin install verification**

**Goal:** Confirm the full install path works: marketplace add → plugin install → skill fires → hooks inject context.

**Prerequisites**
- Claude Code CLI installed and authenticated
- Node ≥22, npm, `haus` CLI available globally. The CLI is not on npm — install it from a checkout: `git clone https://github.com/WeAreHausTech/haus-ai-workflow.git && cd haus-ai-workflow && yarn install && yarn build && npm install -g .` (or `yarn pack` + `npm install -g ./package.tgz`).
- A test project (any repo with a `package.json` will do)

---

**Step 1 — Add the Haus marketplace (once per machine)**

> **Prerequisite — private repo access:** `WeAreHausTech/haus-ai-workflow` is a **private** GitHub repository. Claude Code uses your local git credentials to clone it. Before running the command below, ensure one of these works on your machine:
> - `git clone git@github.com:WeAreHausTech/haus-ai-workflow.git` (SSH key with repo access), **or**
> - `gh auth status` shows you're logged in with `repo` scope.
>
> Without authenticated access the marketplace add will fail with a clone/fetch error.

In any Claude Code session, run:
```
/plugin marketplace add WeAreHausTech/haus-ai-workflow
```

Expected: Claude Code fetches `.claude-plugin/marketplace.json` from the repo root and registers `haus-marketplace` as a known marketplace. No error output.

---

**Step 2 — Install the plugin**

```
/plugin install haus-workflow@haus-marketplace
```

Expected:
- Plugin installs from `plugin/` directory in the repo
- Claude Code discovers skills from `plugin/skills/*/SKILL.md` automatically
- No error about missing `plugin.json` or hooks

---

**Step 3 — Verify skill is available**

Type `/` in Claude Code. Check that these skills (from `plugin/skills/`) appear:
- `/haus-setup-project`
- `/haus-context-router`
- `/haus-workflow`
- `/haus-global-engineering-rules`
- `/haus-skill-author`
- `/haus-documentation-maintainer`

Plugin subagents (from `plugin/agents/`) are also registered:
- `haus-code-reviewer`, `haus-docs-researcher`, `haus-planner`, `haus-security-reviewer`, `haus-test-reviewer`

---

**Step 4 — Run the setup skill in a test project**

Open a Claude Code session in a test project folder. Run:
```
/haus-setup-project
```

Expected conversation flow (from `plugin/skills/haus-setup-project/SKILL.md`):
1. Claude asks: guided walkthrough or fast setup?
2. One-question-at-a-time onboarding
3. Explicit approval gate before running `haus apply --write`
4. After approval: `haus init` runs, then `haus apply --write` writes `.claude/` and `.haus-ai/`

Verify on disk:
```bash
ls .haus-ai/          # context-map.json, recommendation.json, haus.lock.json
ls .claude/           # settings.json, rules/haus.md, rules/security.md
cat .claude/settings.json  # hooks should be present
```

---

**Step 5 — Verify hooks fire**

Start a new Claude Code session in the same project. Submit any user prompt. Check:

- `UserPromptSubmit` hook fires: `haus context --from-hook || true` — look for Haus context injected into the session preamble
- `UserPromptSubmit` hook fires: `haus memory inject --from-hook || true`
- `PreToolUse` (Read/Edit/Write): `haus guard file-access --from-hook || true`
- `PreToolUse` (Bash): `haus guard bash --from-hook || true`

If `haus` binary is missing, hooks should fail silently (exit 0) due to `|| true` — session must not break.

---

**Step 6 — Verify hook contract matches**

```bash
haus doctor --hooks
```

Expected: `Hooks OK` — no mismatch between `plugin/hooks/hooks.json` and `.claude/settings.json`.

---

**Known gotchas**

| Symptom | Cause | Fix |
|---|---|---|
| `/haus-setup-project` not in skill list | Plugin not installed or skill discovery failed | Check `plugin/skills/haus-setup-project/SKILL.md` exists, reinstall plugin |
| `haus: command not found` in hooks | `haus` not globally installed | Install from checkout (`npm install -g .` in repo) or `npm install -g ./package.tgz` after `yarn pack`, then re-run hooks |
| `doctor --hooks` reports mismatch | `settings.json` was written before hook contract update | `haus apply --write` again |
| Context not injected into session | Hook ran but `recommendation.json` missing | Run `haus scan --json && haus recommend --json` |

---

**Pass criteria**

- [x] Marketplace add completes without error
- [x] `/haus-setup-project` visible in skill list
- [x] Skill runs conversational flow (not one-shot dump)
- [x] `.haus-ai/context-map.json` and `.claude/settings.json` created after approval
- [x] `haus doctor --hooks` exits 0
- [x] Hook output visible in session (or silent-fail if haus missing)