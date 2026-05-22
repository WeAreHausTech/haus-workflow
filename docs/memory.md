# Memory

`haus` memory is local-first and file-based under `./.haus-ai/memory`.

## Commands

- `haus memory status`: ensure memory files exist
- `haus memory add <text>`: append redacted learning line
- `haus memory inject [--task] [--from-hook]`: emit compact redacted memory context
- `haus memory promote`: advisory output only (manual promotion)

## Storage model

Managed files:

- `project-learnings.md`
- `decisions.md`
- `recurring-issues.md`
- `client-context.md`
- `index.json`

## Behavior details

- no remote memory backend in current implementation
- no autonomous promotion engine in current implementation
- output length is truncated for hook contexts
