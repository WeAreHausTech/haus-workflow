# Context Minimization

- Start from `haus context --task`.
- Read selected files first, not full directories.
- Add files only when blocked by missing dependency context.
- Stop expansion when task can be executed safely.
- Prefer deterministic artifacts in `.haus-ai/*` over ad-hoc search.
