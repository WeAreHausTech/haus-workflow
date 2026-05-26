# Global install layout

`haus install` seeds `~/.claude/` with haus-owned files. `haus uninstall` reverses it cleanly.

## Layout under `~/.claude/`

```
~/.claude/
  skills/
    haus-workflow/SKILL.md        # all-in-one workflow skill
  agents/
    haus-code-reviewer.md
    haus-docs-researcher.md
    haus-planner.md
    haus-security-reviewer.md
    haus-test-reviewer.md
  settings.json                   # gains keep-gate hook entries + _haus block
  haus/
    install-manifest.json         # path → hash → stable-id → source version
```

## Source-of-truth layout (this repo)

```
library/global/
  skills/
    haus-workflow/SKILL.md
  agents/
    haus-*.md
  settings-fragments/
    hooks.json                    # all 4 hooks with gate metadata
```

These files ship inside the npm tarball via the `files:` allowlist in `package.json`.

## HAUS-MANAGED header convention

Every file written into `~/.claude/` carries a single-line marker on line 1:

| File type | Marker format |
|---|---|
| `.md` | `<!-- HAUS-MANAGED id=<stable-id> v=<schema-version> source=<package@version> -->` |

`<stable-id>` is permanent — e.g. `skill.haus-workflow`, `agent.haus-code-reviewer`. It never changes across package versions; it is the durable handle used by update and uninstall.

## `settings.json` merging

`haus install` adds hook entries to `~/.claude/settings.json`:

- **keep** hooks (file-access guard, bash guard) are written into `settings.hooks.*` entries.
- **gate-default-off** hooks (context, memory-inject) are not written; they remain in `hooks.json` for opt-in.

Ownership is recorded in a top-level `_haus` block:

```json
{
  "hooks": { "PreToolUse": [ ... ] },
  "_haus": { "hooks": ["hook.guard.file-access", "hook.guard.bash"] }
}
```

`haus uninstall` reads `_haus.hooks`, strips matching entries from `settings.hooks`, and removes the `_haus` block. User-added hooks outside this list are preserved byte-for-byte.

## Update semantics

| Existing file state | Action |
|---|---|
| Missing | Create |
| HAUS-MANAGED header matches stable-id, hash matches manifest | Overwrite if package version newer |
| HAUS-MANAGED header matches stable-id, hash diverges from manifest | User edited — skip with warning; `--force` to overwrite |
| No HAUS-MANAGED header | Refuse — user owns the file; warn loudly |
| In old manifest, not in current package | Delete |

## Commands

| Command | Effect |
|---|---|
| `haus install` | Copy haus files into `~/.claude/`, merge hook entries, write manifest |
| `haus install --dry-run` | Print planned diff, no writes |
| `haus install --check` | Exit non-zero if any HAUS-MANAGED file is out of date (used by CI / `haus update`) |
| `haus install --force` | Overwrite user-edited haus files |
| `haus uninstall` | Remove every HAUS-MANAGED file, strip haus hooks from `settings.json` |
| `haus uninstall --force` | Remove even files with stable-id mismatch |

## Hook gate decisions (from P2 audit)

| Hook | Event | Decision | Reason |
|---|---|---|---|
| `haus guard file-access --from-hook` | PreToolUse (Read/Edit/Write) | **keep** | Blocks sensitive-path reads — load-bearing for security story |
| `haus guard bash --from-hook` | PreToolUse (Bash) | **keep** | Blocks dangerous commands — load-bearing for safety |
| `haus context --from-hook` | UserPromptSubmit | **gate-default-off** | ~78 tokens repeat context already in CLAUDE.md; ~400 ms Node-spawn overhead per prompt |
| `haus memory inject --from-hook` | UserPromptSubmit | **gate-default-off** | Only useful when memory store has content (opt-in capability) |
