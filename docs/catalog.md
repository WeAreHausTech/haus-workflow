# Catalog

Catalog lives in `library/catalog/manifest.json`.

- `allowed-stacks.json`: Haus-supported stack allowlist.
- `haus-lock.schema.json`: lockfile schema.
- `manifest.json`: curated Haus-owned skills and agents.

## Skill authoring pipeline

1. Start from official framework docs and official provider materials.
2. Curate selected external workflows (Superpowers/ECC/etc) into Haus-owned patterns.
3. Keep `SKILL.md` short router; move detail to references.
4. Add catalog entry with allowed stack tags, role matches, token estimate.
5. Run:

```bash
yarn catalog:audit
yarn sources:audit
```
