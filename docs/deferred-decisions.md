# Deferred decisions

Known deferred implementation decisions — kept here so they are not forgotten. Each entry records the context, the trigger for acting, and the exact change needed.

---

## Ecosystem-based testing fallback in `computeRuleIntents`

**File:** `src/recommender/task-intent.ts` — `computeRuleIntents`

**Status:** Deferred — low impact, no current behaviour change needed.

### Context

Skills with testing-related tags (`storybook`, `testing-library`, `playwright`, `phpunit`, `testing`) are caught by the `isTestingRule` tag check before the ecosystem→intent map is evaluated. This means `ecosystem: "testing"` on `testing-library-patterns` (and `ecosystem: "storybook"` on `storybook-patterns`) is cosmetic — it is never reached in `computeRuleIntents`.

Verified 2026-06-01: the `eco === 'testing'` path still does not exist in the ecosystem map.

### When to implement

If a new testing skill is added that does **not** have a recognised testing tag (e.g. a custom test runner with an unfamiliar tag name). At that point the ecosystem field is the only signal left.

### Change required

In `src/recommender/task-intent.ts`, inside `computeRuleIntents`, add after the `isTestingRule` early-return block (currently around line 299):

```ts
// Ecosystem-based fallback for testing rules not covered by known tags.
if (eco === 'testing' || eco === 'playwright' || eco === 'storybook') {
  intents.add('testing')
  return intents
}
```

Also update the `isTestingRule` tag list to include the new tag so future skills don't rely solely on the ecosystem field.
