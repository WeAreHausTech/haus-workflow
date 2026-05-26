<!-- HAUS-PRERELEASE-CLEANUP: P4e — plugin/ directory removed; surviving skill content relocates to library/global/skills/ in P5. -->
# Context Minimization

- Start from `haus context --task`.
- Read selected files first, not full directories.
- Add files only when blocked by missing dependency context.
- Stop expansion when task can be executed safely.
- Prefer deterministic artifacts in `.haus-workflow/*` over ad-hoc search.