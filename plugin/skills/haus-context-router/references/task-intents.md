<!-- HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5. -->
# Task Intents

Task router uses deterministic intents (backend, frontend, graphql, auth, testing, docs, monorepo, etc.).

Guidance:

- keep task text concrete (`add queue job`, `build dashboard route`)
- avoid mixed unrelated intents in one prompt
- rerun context selection if task scope changes