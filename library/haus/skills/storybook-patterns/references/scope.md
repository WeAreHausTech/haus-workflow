# Scope

## In-scope files and dirs

- `src/**/*.stories.tsx`, `src/**/*.stories.ts` — story files co-located with components
- `.storybook/main.ts` — addons, framework, staticDirs, webpack/vite builder config
- `.storybook/preview.tsx` — global decorators, parameters, viewport presets
- `.storybook/preview-head.html` — injected HTML (fonts, CSS resets)
- `src/**/*.mdx` — docs-mode MDX stories
- `chromatic.config.json` — Chromatic visual regression config (if used)

## Stack boundaries

- Storybook 8+: CSF3 format, `Meta<typeof Component>`, `StoryObj<typeof Component>`
- Controls: derived from TypeScript prop types via `autodocs` — no manual argTypes unless overriding
- Decorators: wrap stories with providers (theme, router, i18n, store) in `.storybook/preview.tsx`
- Not in scope: backend/domain behavior unrelated to component rendering
- Not in scope: E2E flow testing (use playwright-patterns)

## Triggers

- Adding a new shared component — requires at least `Default` story
- Changing a component's public prop interface
- Adding a new variant (`size`, `intent`, `disabled` state)
- Adding interactive behavior tested via `play()` function
- Changing global decorators or providers in `.storybook/preview.tsx`
- Setting up Chromatic for visual regression on new component
