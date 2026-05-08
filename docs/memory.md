# Memory

Local-first memory under `.haus-ai/memory/`.

## Update conflict workflow

- Run `haus update --check`.
- Review summary and run `git diff`.
- If local `.claude` overrides exist, keep local files and update lockfile only.
- Apply with `haus update`.
- Re-run `haus doctor`.
