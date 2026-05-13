# Workflow

## Implementation steps

1. Identify affected route segment: locate `app/` folder, check parent `layout.tsx` impact
2. Confirm server vs client boundary: `"use client"` only when browser APIs or hooks are needed
3. For data fetching: fetch in server component — avoid duplicating fetch across layout and page
4. Use `cache()` for shared data loaders called from multiple server components
5. For mutations: implement as server action in `actions.ts`; call `revalidatePath`/`revalidateTag` after
6. Review middleware `matcher`: ensure protected routes are covered, public routes excluded
7. Validate metadata: `generateMetadata` returns correct `title`, `description`, `og:*` fields
8. Add `loading.tsx` for async segments; add `error.tsx` with `"use client"` for error boundaries
9. Test: `next build` for type/compilation errors; validate route in dev server

## Commands

```bash
next dev                          # local dev server
next build                        # production build — catches type and compilation errors
next start                        # run production build locally
yarn tsc --noEmit                  # type check without building

# Cache debugging
next build && next start          # validate static/dynamic rendering decisions
NEXT_TELEMETRY_DISABLED=1 next build --debug
```

## Validation checklist

- [ ] No `useRouter`, `useSearchParams`, `usePathname` in server components
- [ ] No `fetch()` called for same resource in both layout and page
- [ ] `"use client"` boundary is as far down the tree as possible
- [ ] Server actions have input validation before DB/service call
- [ ] Route handlers return correct `Content-Type` header and HTTP status
- [ ] Middleware `matcher` array covers all protected route patterns
- [ ] `revalidatePath` / `revalidateTag` called after all server action mutations
- [ ] `generateStaticParams` returns exhaustive list for fully static routes
