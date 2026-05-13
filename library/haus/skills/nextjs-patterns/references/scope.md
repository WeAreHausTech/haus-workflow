# Scope

## In-scope files and dirs

- `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/template.tsx` — route segments
- `app/**/route.ts` — API route handlers (GET, POST, PUT, DELETE)
- `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/not-found.tsx` — special segments
- `app/**/actions.ts` — server actions (`"use server"`)
- `middleware.ts` — edge middleware (auth, redirects, locale)
- `next.config.ts` / `next.config.mjs` — build and runtime config, redirects, rewrites
- `app/**/opengraph-image.tsx`, `app/**/sitemap.ts` — metadata generation files
- `lib/**`, `utils/**` — shared server-side utilities consumed by RSC

## Stack boundaries

- Next.js App Router: routing, server components, data fetching, caching, streaming
- Server actions: form mutations, revalidation — must use `"use server"` directive
- Edge middleware: authentication, A/B flags, geo-routing — no Node.js-only APIs
- Not in scope: pure React component logic with no routing or Next.js API coupling
- Not in scope: backend service logic not running in Next.js runtime

## Triggers

- Adding or restructuring `app/` route segments (folders, groups, parallel routes)
- Changing `generateMetadata` or `generateStaticParams` exports
- Touching `revalidatePath`, `revalidateTag`, or `unstable_cache`
- Adding or modifying server actions
- Changing `headers()`, `cookies()`, `redirect()` usage in server components
- Modifying middleware `matcher` config or auth logic in `middleware.ts`
- Changing `next.config` (rewrites, redirects, image domains, experimental flags)
