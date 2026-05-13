# Workflow

## Implementation steps

1. Create story file adjacent to component: `Button.stories.tsx` next to `Button.tsx`
2. Use CSF3 format: export `const meta: Meta<typeof Component>` and `StoryObj` named exports
3. Define `Default` story first — covers the most common usage with realistic args
4. Add stories for all meaningful variants: `Disabled`, `Loading`, `Destructive`, `WithIcon`
5. Use `args` for data that controls vary — never hardcode values in render functions
6. Add `play()` function for interaction tests (click, type, keyboard nav) using Testing Library
7. For providers: add global decorator in `preview.tsx`; per-story decorator in `meta.decorators`
8. Run Storybook and visually verify each story state; check a11y addon panel

## Commands

```bash
yarn storybook dev -p 6006               # start dev server
yarn storybook build                     # static build for CI/deploy
yarn storybook build --quiet             # suppress verbose output

# Interaction test runner
yarn storybook test                      # run play() functions as tests

# Chromatic visual regression
yarn chromatic --project-token=<token>

# Type check stories
yarn tsc --noEmit
```

## Validation checklist

- [ ] Every public component prop has a control (auto from TypeScript types)
- [ ] `Default` story renders without console errors or warnings
- [ ] Loading, error, empty, and disabled states covered by named stories
- [ ] `play()` function added for interactive components (dialog open/close, form submit)
- [ ] Global providers (ThemeProvider, QueryClientProvider) added to `preview.tsx` decorators
- [ ] Stories do not import from test utilities (`@testing-library/jest-dom`) — use `@storybook/test`
- [ ] No hardcoded mock IDs that conflict when running multiple stories simultaneously
