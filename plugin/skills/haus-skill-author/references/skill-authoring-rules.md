# Skill Authoring Rules

## Layout and size

- Keep `SKILL.md` small and action-oriented.
- Co-locate a `references/` directory beside `SKILL.md`; put large or volatile detail there.
- Add explicit **Use when** and **Do not use when** sections (or equivalent headings) on each skill surface.

## Metadata

- Start `SKILL.md` with YAML frontmatter including at least `name` and `description`.
- Keep guidance stack-specific and deterministic.

## Catalog identifiers (PRPM-style consistency)

- Use stable Haus ids: `haus.<slug>` for catalog rows.
- Stack-oriented skills favor a `-patterns` suffix where it matches `library/catalog/allowed-stacks.json` policy.
- Align tags with allowlisted tokens so `yarn catalog:audit` stays quiet.

## Safety

- Never include secret-handling bypasses.
