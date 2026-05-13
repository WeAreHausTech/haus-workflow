# Scope

## In-scope files and dirs

- `src/components/**/*.vue` — Vue Single File Components
- `src/composables/**/*.ts` — Composition API composables (`use*.ts`)
- `src/stores/**/*.ts` — Pinia store definitions
- `src/router/index.ts`, `src/router/routes.ts` — vue-router route definitions and guards
- `src/views/**/*.vue` — route-level view components
- `src/plugins/**` — Vue plugin registrations (i18n, etc.)
- `src/main.ts` — app bootstrap and global plugin registration

## Stack boundaries

- Vue 3 Composition API: `setup()`, `ref`, `computed`, `watch`, `provide/inject`
- Pinia: stores with `defineStore`, `storeToRefs`, actions as async functions
- vue-router: `createRouter`, `RouterView`, navigation guards (`beforeEach`, `beforeEnter`)
- Not in scope: React/Next.js component logic
- Not in scope: backend API/service implementation

## Triggers

- Adding or modifying a Vue component's `setup()` logic
- Adding or changing a Pinia store (state, getters, actions)
- Adding navigation guard logic in vue-router
- Adding a composable (`useFeature.ts`) for shared reactive logic
- Changing component emit contract (`defineEmits`) or props (`defineProps`)
- Adding `provide/inject` for cross-component dependency
- Migrating from Options API to Composition API
