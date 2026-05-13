# Workflow

## Implementation steps

1. Check if shadcn already has a matching component: `yarn shadcn@latest add <component-name>`
2. If adding new component: use CLI to generate — do not copy from docs manually
3. For variant changes: edit `cva()` call in `components/ui/<component>.tsx` — add to `variants` map
4. For composition: use `asChild` to delegate rendering to a custom element; verify prop forwarding
5. Check Radix sub-component structure: use `Root`, `Trigger`, `Content` pattern consistently
6. For theming: change CSS variables in `globals.css` — never hardcode colors in component files
7. Verify keyboard behavior: Tab, Shift+Tab, Enter, Escape, Arrow keys for interactive components
8. Verify aria attributes: inspect with browser devtools Accessibility tree, not just visual output

## Commands

```bash
# Add shadcn component
yarn shadcn@latest add button
yarn shadcn@latest add dialog
yarn shadcn@latest add dropdown-menu

# Type check
yarn tsc --noEmit

# Run component tests
jest --testPathPattern components/ui
yarn storybook dev -p 6006     # visual inspection of component states

# Accessibility audit
yarn axe-core                  # or use Storybook a11y addon
```

## Validation checklist

- [ ] `asChild` used when wrapping a Radix trigger with a custom element (e.g., `Link`)
- [ ] Focus trap works in `Dialog`, `Popover`, `Select` — Tab stays inside when open
- [ ] Keyboard: Escape closes overlay; Arrow keys navigate `DropdownMenu`, `Select`
- [ ] `cn()` used for all conditional class merging — no raw string concatenation
- [ ] New `cva` variants follow existing naming conventions (`default`, `outline`, `ghost`, `sm`, `lg`)
- [ ] CSS variables used for all color/spacing tokens — no hex values in component files
- [ ] Component forwards `ref` via `React.forwardRef` if it wraps a Radix primitive
