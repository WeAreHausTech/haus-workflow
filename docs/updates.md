# Updates and Lockfile

## Commands

- `haus update --check`: report lock status and override presence
- `haus update`: refresh lock hashes and print lock diff summary

## Lockfile model

Primary file: `./.haus-ai/haus.lock.json`

Each row tracks:

- `id`, `type`, `source`
- `version`
- `installMode`
- `paths`
- `hash`

`hash` is recomputed from contents of `paths` (content-addressed).

## Safety behavior

- existing lockfile is backed up to `./.haus-ai/backups`
- local `.claude/settings.json` override presence is detected
- update warns that local overrides are preserved
- lock diff uses unified diff output (`diff` dependency)
