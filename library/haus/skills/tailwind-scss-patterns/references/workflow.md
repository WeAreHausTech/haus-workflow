# Workflow

## Implementation steps

1. Decide styling approach: Tailwind utilities for standard layout/color, SCSS module for complex animation/selectors
2. For new Tailwind tokens: add to `theme.extend` in `tailwind.config.ts` — never override base theme keys
3. For SCSS modules: name file `Component.module.scss`; import as `styles` object; compose with `cn(styles.root, ...)`
4. For global utilities: add via `@layer utilities` in `globals.css` — not ad-hoc utility overrides
5. Use `cn()` (clsx + tailwind-merge) for conditional class composition — prevents override conflicts
6. Check Tailwind purge: ensure new dynamic class names are in safelist or derive from static strings
7. Validate dark mode: use `dark:` variant if project uses Tailwind dark mode; match CSS variable definitions
8. Run visual diff in Storybook or dev server after token changes

## Commands

```bash
# Development
next dev / vite dev                         # confirm styles render correctly in browser

# Build (triggers Tailwind purge)
next build / vite build

# Type check
yarn tsc --noEmit

# SCSS lint
yarn stylelint "src/**/*.scss" --fix

# Tailwind class sort (if Prettier plugin configured)
yarn prettier --write "src/**/*.tsx"

# Inspect generated CSS (Tailwind CLI)
yarn tailwindcss -i ./src/styles/global.scss -o ./dist/output.css --watch
```

## Validation checklist

- [ ] New tokens added to `theme.extend` — base Tailwind theme not overridden
- [ ] CSS variables defined in `globals.css` `:root` and `.dark` for dark mode support
- [ ] Dynamic class names (template literals) either in safelist or replaced with static variants
- [ ] `cn()` used for all conditional/merged class strings — no raw string concatenation
- [ ] SCSS modules use `:local` scoping — no global selector pollution
- [ ] `@apply` used sparingly in SCSS — prefer utility composition over `@apply` chains
- [ ] Production build purges unused classes — verify output CSS size is expected
