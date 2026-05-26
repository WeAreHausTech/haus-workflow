---
# HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5.
name: haus-skill-author
description: Author Haus-owned skills from approved sources only.
---

# Haus Skill Author

## Use when

- creating or revising Haus skill library content
- converting accepted external ideas into Haus-owned guidance

## Do not use when

- source idea has not passed curation gates
- task asks for direct copy/import from external repositories

## Router

1. Validate source decisions (`yarn sources:decisions`).
2. Write short router `SKILL.md` only.
3. Put volatile details in `references/`.
4. Record source influence in manifest metadata.
5. Run audits/tests before publish.

## References

- `references/skill-authoring-rules.md`
- `references/router-vs-manual.md`