# Deferred decisions

Known deferred implementation decisions — kept here so they are not forgotten. Each entry records the context, the trigger for acting, and the exact change needed.

---

## Ecosystem-based testing fallback in task-intent routing

**Status:** Closed — moot after removal of `haus context` and the task-intent router (PR #106).

The `computeRuleIntents` / ecosystem→intent map lived in the deleted `task-intent` cluster. If task-scoped context selection returns via a catalog skill or agent, revisit there — not in the CLI hook path.
