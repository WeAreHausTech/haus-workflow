# Scope

## In-scope files and dirs

- `tailwind.config.ts` / `tailwind.config.js` — theme extension, content paths, plugins, safelist
- `src/**/*.module.scss`, `src/**/*.module.css` — CSS module files co-located with components
- `app/globals.css` / `src/styles/global.scss` — global layer rules and CSS custom properties
- `src/**/*.tsx` (className usage only) — utility class composition in components
- `postcss.config.js` / `postcss.config.mjs` — PostCSS plugin chain
- `src/styles/**` — shared SCSS partials, mixins, token maps

## Stack boundaries

- Tailwind: utility-first class composition via `cn()` / `clsx`; extends via `theme.extend`
- SCSS Modules: scoped styles for components that need complex selectors or animations
- CSS custom properties: design tokens consumed by both Tailwind and SCSS
- Not in scope: Radix/shadcn component logic changes not related to styling (use radix-shadcn-patterns)
- Not in scope: backend or data layer changes

## Triggers

- Adding or changing Tailwind theme tokens (colors, spacing, radius, shadows)
- Adding SCSS module for a component that needs animation or complex pseudo-selectors
- Adding `@layer components` or `@layer utilities` rules in global CSS
- Changing `content` paths in `tailwind.config.ts` (causes purge scope change)
- Adding a Tailwind plugin (typography, forms, animate)
- Changing CSS variable values used for design tokens
