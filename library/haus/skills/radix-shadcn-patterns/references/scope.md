# Scope

## In-scope files and dirs

- `components/ui/**` — shadcn/ui generated component wrappers (`button.tsx`, `dialog.tsx`, etc.)
- `lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `components/**/*.tsx` — feature components composing Radix primitives
- `tailwind.config.ts` — design token CSS variables consumed by shadcn
- `app/globals.css` — CSS variable definitions for shadcn themes (`:root`, `.dark`)
- `components/ui/index.ts` — barrel exports for UI library

## Stack boundaries

- Radix UI primitives: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, etc.
- shadcn/ui: opinionated wrappers with `cva()` variants, re-exported Radix sub-components
- Accessibility: keyboard nav, focus traps, aria roles are owned by Radix — do not override
- Not in scope: domain/business logic inside components with no UI primitive impact
- Not in scope: Tailwind config changes not related to component tokens (use tailwind-scss-patterns)

## Triggers

- Adding a new shadcn component via CLI (`yarn shadcn add` — shadcn installed as devDep)
- Modifying variant options in `cva()` calls within a UI component
- Composing Radix sub-components (`Dialog.Trigger`, `Dialog.Content`) in a feature component
- Changing CSS variable values in `globals.css` (color tokens, radius, spacing)
- Adding or changing `asChild` prop usage on Radix components
- Extending a shadcn component with additional `className` or `variant` props
