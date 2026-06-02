/**
 * Data-driven detection registry — replaces the hand-written if-chains in
 * scan-project.ts with a typed rule table evaluated by {@link runDetection}.
 *
 * Each rule fires when its signal group matches (`all` = AND, `any` = OR) and then
 * contributes a repo role and/or a bucketed stack entry. Rules are evaluated in array
 * order, so stack-bucket arrays preserve insertion order (locked by the detection
 * characterization test).
 *
 * Matching is case-sensitive against raw dependency names and relative file paths —
 * identical to the original scanner. The package-manager bucket and the WordPress role
 * priority logic stay in scan-project.ts because they depend on inputs the registry
 * does not model (resolved package manager; ordered bedrock-vs-vanilla precedence).
 */

/** A single detection signal. Constructed via the helpers below for readable rules. */
export type DetectionSignal =
  | { kind: 'dep'; value: string }
  | { kind: 'depPrefix'; value: string }
  | { kind: 'depAbsent'; value: string }
  | { kind: 'file'; value: string; mode: 'endsWith' | 'includes' | 'equals' | 'startsWith' }
  | { kind: 'content'; value: string }

export const dep = (value: string): DetectionSignal => ({ kind: 'dep', value })
export const depPrefix = (value: string): DetectionSignal => ({ kind: 'depPrefix', value })
export const depAbsent = (value: string): DetectionSignal => ({ kind: 'depAbsent', value })
export const fileEndsWith = (value: string): DetectionSignal => ({ kind: 'file', value, mode: 'endsWith' })
export const fileIncludes = (value: string): DetectionSignal => ({ kind: 'file', value, mode: 'includes' })
export const fileEquals = (value: string): DetectionSignal => ({ kind: 'file', value, mode: 'equals' })
export const fileStartsWith = (value: string): DetectionSignal => ({ kind: 'file', value, mode: 'startsWith' })
export const content = (value: string): DetectionSignal => ({ kind: 'content', value })

/** A detection rule: matches when its `all`/`any` signals hold, then contributes role/stack. */
export interface DetectionRule {
  /** Repo role to add when matched (e.g. "next-app"). */
  role?: string
  /** Bucketed stack entry to add when matched, as [bucket, name]. */
  stack?: readonly [bucket: string, name: string]
  /** All signals must match (AND). */
  all?: DetectionSignal[]
  /** At least one signal must match (OR). */
  any?: DetectionSignal[]
}

/** Inputs a rule is evaluated against. All matching is case-sensitive. */
export interface DetectionContext {
  /** Raw dependency names (npm + composer), case preserved. */
  deps: Set<string>
  /** Safe, non-sensitive relative file paths. */
  files: string[]
  /** Concatenation of candidate file contents (built once) for `content` signals. */
  contentBlob: string
}

/** Bucket order for detectedStacks — preserved in the output object key order. */
export const STACK_BUCKETS = [
  'backend',
  'frontend',
  'databases',
  'testing',
  'auth',
  'tooling',
  'packageManagers',
] as const

function matchSignal(sig: DetectionSignal, ctx: DetectionContext): boolean {
  switch (sig.kind) {
    case 'dep':
      return ctx.deps.has(sig.value)
    case 'depPrefix':
      for (const d of ctx.deps) if (d.startsWith(sig.value)) return true
      return false
    case 'depAbsent':
      return !ctx.deps.has(sig.value)
    case 'content':
      return ctx.contentBlob.includes(sig.value)
    case 'file':
      return ctx.files.some((f) => {
        switch (sig.mode) {
          case 'endsWith':
            return f.endsWith(sig.value)
          case 'includes':
            return f.includes(sig.value)
          case 'equals':
            return f === sig.value
          case 'startsWith':
            return f.startsWith(sig.value)
        }
      })
  }
}

function matchRule(rule: DetectionRule, ctx: DetectionContext): boolean {
  if (rule.all) return rule.all.every((s) => matchSignal(s, ctx))
  if (rule.any) return rule.any.some((s) => matchSignal(s, ctx))
  return false
}

/**
 * Role rules. Output order is irrelevant — scan-project sorts roles — so these are
 * grouped for readability rather than ordered. WordPress roles are NOT here: their
 * bedrock-vs-vanilla precedence is resolved in scan-project.ts.
 */
export const ROLE_RULES: DetectionRule[] = [
  { role: 'next-app', any: [dep('next'), fileIncludes('next.config.')] },
  { role: 'react-app', any: [dep('react')] },
  { role: 'vite-app', any: [dep('vite'), fileIncludes('vite.config.')] },
  { role: 'react-router-app', all: [dep('react-router'), dep('@react-router/node')] },
  { role: 'sanity-studio', any: [dep('sanity')] },
  { role: 'strapi-app', any: [dep('@strapi/strapi'), depPrefix('@strapi/')] },
  { role: 'expo-app', any: [dep('expo')] },
  { role: 'vendure-app', any: [dep('@vendure/core')] },
  { role: 'vendure-plugin', any: [depPrefix('@haus/vendure-'), fileIncludes('vendure-config')] },
  { role: 'nestjs-api', any: [dep('@nestjs/core')] },
  { role: 'graphql-api', any: [dep('graphql'), dep('@nestjs/graphql')] },
  { role: 'nx-monorepo', any: [fileEndsWith('nx.json')] },
  { role: 'turbo-monorepo', any: [fileEndsWith('turbo.json')] },
  { role: 'laravel-app', any: [fileEndsWith('artisan'), dep('laravel/framework')] },
  { role: 'laravel-nova-app', any: [dep('laravel/nova')] },
  { role: 'dotnet-service', any: [fileEndsWith('.csproj'), fileEndsWith('.sln')] },
  { role: 'express-service', any: [dep('express')] },
]

/**
 * Stack rules in EXACT original evaluation order — the detectedStacks bucket arrays
 * preserve insertion order, so reordering would change output and fail the
 * characterization test. The package-manager bucket is appended by scan-project.ts.
 */
export const STACK_RULES: DetectionRule[] = [
  { stack: ['frontend', 'nextjs'], any: [dep('next')] },
  { stack: ['frontend', 'react19'], any: [dep('react')] },
  { stack: ['frontend', 'vue'], any: [dep('vue')] },
  { stack: ['frontend', 'vite8'], any: [dep('vite')] },
  { stack: ['frontend', 'react-router-v7'], all: [dep('react-router'), dep('@react-router/node')] },
  { stack: ['frontend', 'tailwindcss'], any: [dep('tailwindcss'), fileIncludes('tailwind.config.')] },
  {
    stack: ['frontend', 'shadcn'],
    all: [fileEndsWith('components.json'), dep('class-variance-authority')],
  },
  { stack: ['tooling', 'typescript5'], any: [dep('typescript')] },
  { stack: ['backend', 'sanity'], any: [dep('sanity'), dep('next-sanity'), dep('@sanity/client')] },
  { stack: ['backend', 'strapi'], any: [dep('@strapi/strapi'), depPrefix('@strapi/')] },
  { stack: ['backend', 'prisma'], any: [dep('prisma'), dep('@prisma/client')] },
  { stack: ['frontend', 'expo'], any: [dep('expo')] },
  { stack: ['frontend', 'react-native'], any: [dep('react-native')] },
  { stack: ['tooling', 'i18next'], any: [dep('i18next'), dep('react-i18next')] },
  { stack: ['tooling', 'bullmq'], any: [dep('bullmq')] },
  { stack: ['tooling', 'docker'], any: [fileEquals('Dockerfile'), fileStartsWith('docker-compose')] },
  { stack: ['tooling', 'pm2'], any: [dep('pm2'), fileIncludes('ecosystem.config')] },
  { stack: ['tooling', 'sentry'], any: [depPrefix('@sentry/')] },
  { stack: ['tooling', 'deployer-php'], any: [dep('deployer/deployer')] },
  { stack: ['tooling', 'missing-prettier'], any: [depAbsent('prettier')] },
  { stack: ['tooling', 'missing-eslint'], any: [depAbsent('eslint')] },
  {
    stack: ['tooling', 'stripe'],
    any: [dep('@stripe/stripe-js'), dep('@stripe/react-stripe-js')],
  },
  { stack: ['tooling', 'qliro'], any: [dep('@haus-tech/qliro-plugin')] },
  {
    stack: ['databases', 'supabase'],
    any: [dep('@supabase/supabase-js'), depPrefix('@supabase/')],
  },
  { stack: ['backend', 'vendure3'], any: [dep('@vendure/core')] },
  { stack: ['backend', 'nestjs'], any: [dep('@nestjs/core')] },
  { stack: ['backend', 'nestjs'], any: [content('NestFactory')] },
  { stack: ['backend', 'vendure3'], any: [content('@VendurePlugin')] },
  { stack: ['backend', 'graphql'], any: [dep('graphql'), dep('@nestjs/graphql')] },
  { stack: ['backend', 'graphql'], any: [fileEndsWith('.graphql'), fileEndsWith('schema.graphql')] },
  { stack: ['backend', 'laravel'], any: [dep('laravel/framework')] },
  { stack: ['backend', 'laravel'], any: [fileIncludes('app/Providers/'), fileIncludes('routes/')] },
  { stack: ['backend', 'wordpress'], any: [fileEndsWith('wp-config.php'), dep('roots/wordpress')] },
  {
    stack: ['backend', 'elementor'],
    any: [
      dep('wpackagist-plugin/elementor'),
      dep('wearehaus/elementor-pro'),
      dep('wpackagist-theme/hello-elementor'),
    ],
  },
  {
    stack: ['backend', 'acf-pro'],
    any: [
      dep('wearehaus/advanced-custom-fields-pro'),
      dep('wpackagist-plugin/advanced-custom-fields'),
    ],
  },
  { stack: ['backend', 'jetengine'], any: [dep('wearehaus/jet-engine')] },
  { stack: ['backend', 'jetsmartfilters'], any: [dep('wearehaus/jet-smart-filters')] },
  { stack: ['backend', 'gravityforms'], any: [dep('wearehaus/gravityforms')] },
  { stack: ['backend', 'dotnet'], any: [fileEndsWith('.csproj'), fileEndsWith('.sln')] },
  { stack: ['testing', 'playwright'], any: [dep('@playwright/test')] },
  { stack: ['testing', 'storybook'], any: [fileIncludes('.storybook')] },
  { stack: ['testing', 'testing-library'], any: [depPrefix('@testing-library/')] },
  { stack: ['testing', 'phpunit'], any: [fileEndsWith('phpunit.xml')] },
  { stack: ['testing', 'storybook'], any: [depPrefix('@storybook/')] },
  { stack: ['testing', 'vitest'], any: [dep('vitest')] },
  { stack: ['testing', 'jest'], any: [dep('jest'), dep('jest-environment-jsdom')] },
  { stack: ['databases', 'postgresql'], any: [dep('pg')] },
  { stack: ['databases', 'mariadb'], any: [dep('mariadb'), dep('mysql2')] },
  { stack: ['databases', 'mysql'], any: [dep('mysql'), dep('mysql2')] },
  { stack: ['databases', 'mssql'], any: [dep('mssql')] },
  { stack: ['databases', 'elasticsearch'], any: [dep('@elastic/elasticsearch')] },
  { stack: ['databases', 'redis'], any: [dep('predis/predis'), dep('ioredis'), dep('redis')] },
  { stack: ['auth', 'oidc'], any: [content('openid')] },
  { stack: ['auth', 'azure-ad'], any: [content('AZURE_AD')] },
  { stack: ['auth', 'bankid'], any: [content('BANKID')] },
  {
    stack: ['auth', 'saml2'],
    any: [dep('24slides/laravel-saml2'), dep('aacotroneo/laravel-saml2')],
  },
  { stack: ['auth', 'next-auth'], any: [dep('next-auth'), dep('@auth/core')] },
]

export interface DetectionOutput {
  roles: string[]
  stacks: Record<string, string[]>
}

/**
 * Evaluates the role and stack rule tables against the context. Returns matched roles
 * (unsorted — caller sorts) and bucketed stacks (insertion order preserved). The caller
 * adds WordPress roles and the package-manager bucket.
 *
 * @param rules - Stack rules to run (the default registry, or merged with derived rules).
 */
export function runDetection(
  ctx: DetectionContext,
  rules: DetectionRule[] = STACK_RULES,
): DetectionOutput {
  const roles: string[] = []
  for (const rule of ROLE_RULES) {
    if (rule.role && matchRule(rule, ctx) && !roles.includes(rule.role)) roles.push(rule.role)
  }
  const stacks: Record<string, string[]> = {}
  for (const bucket of STACK_BUCKETS) stacks[bucket] = []
  for (const rule of rules) {
    if (!rule.stack || !matchRule(rule, ctx)) continue
    const [bucket, name] = rule.stack
    stacks[bucket] ??= []
    if (!stacks[bucket].includes(name)) stacks[bucket].push(name)
  }
  return { roles, stacks }
}
