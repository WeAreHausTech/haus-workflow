# Workflow

## Implementation steps

1. Identify component scope: presentational (no store), feature (Pinia store), or route-level view
2. For new component: use `<script setup lang="ts">` — avoid Options API in new code
3. Define props with `defineProps<{ prop: Type }>()` and emits with `defineEmits<{ event: [payload] }>()`
4. Extract reusable stateful logic into composables: `src/composables/useFeature.ts`
5. For shared state: define Pinia store with `defineStore`; access in components via `storeToRefs`
6. Use `watch` for side effects on reactive deps; prefer `watchEffect` for automatic dep tracking
7. For routing: add route in `routes.ts`, apply navigation guard if auth required
8. Write Vitest test for composable; use `@testing-library/vue` for component behavior test

## Commands

```bash
vite dev                                        # start dev server
vite build                                      # production build
yarn vue-tsc --noEmit                            # type check .vue SFCs (use vue-tsc, not tsc)

# Tests
yarn vitest                                      # watch mode
yarn vitest run                                  # single run
yarn vitest --coverage

# Generate component (if Vue CLI / volar tools configured)
# No standard generator — scaffold manually or use project template
```

## Validation checklist

- [ ] Props never mutated directly — emit event to parent; use local `ref` copy if needed
- [ ] Pinia actions handle async errors — catch and set error state in store
- [ ] `storeToRefs` used when destructuring Pinia store — not raw destructuring (breaks reactivity)
- [ ] Composables return reactive refs/computed — not raw values
- [ ] Navigation guard returns `false` or redirects for unauthorized routes
- [ ] `watch` includes `{ immediate: true }` only when first-run side effect is intentional
- [ ] `vue-tsc --noEmit` passes — no type errors in `.vue` `<script setup>` blocks
