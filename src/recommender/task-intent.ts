/**
 * Infers task type (feature, fix, refactor) from a task description to bias catalog scoring.
 * Provides keyword→intent classification and rule-intent routing for `haus context`.
 */

import type { Recommendation } from '../types.js'

type RecommendedRule = Recommendation['recommended'][number]

/**
 * Deterministic task-context filter over `recommendation.json`. Never widens the
 * recommended set; only narrows it.
 *
 * Order:
 *   1. No task -> return entire recommended set unchanged.
 *   2. Task with classified intents -> keep rules whose computed intents overlap; baselines excluded.
 *   3. Task without classified intents (ambiguous) -> token-keyword fallback against id/tags/ecosystem; baselines excluded.
 *   4. Still empty -> non-baseline medium/high rules, capped at 8 to avoid "select everything" behavior.
 */
export function pickTaskRelevantRules(
  recommendation: Recommendation | undefined,
  task: string | undefined,
  taskIntents: Set<TaskIntent> = new Set(),
): RecommendedRule[] {
  const recommended = recommendation?.recommended ?? []
  if (!task) return recommended

  if (taskIntents.size > 0) {
    const intentMatches = recommended.filter((rule) => {
      if (rule.selectionMode === 'baseline') return false
      const ruleIntents = computeRuleIntents(rule)
      if (ruleIntents.size === 0) return false
      for (const ti of taskIntents) {
        if (ruleIntents.has(ti)) return true
      }
      return false
    })
    if (intentMatches.length > 0) return intentMatches
  }

  const tokens = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
  const tokenMatches = recommended.filter((rule) => {
    if (rule.selectionMode === 'baseline') return false
    const corpus = [
      rule.id,
      rule.ecosystem ?? '',
      ...(rule.tags ?? []),
      rule.reason ?? '',
      ...rule.reasons.map((r) => r.message),
    ]
      .join(' ')
      .toLowerCase()
    return tokens.some((token) => corpus.includes(token))
  })
  if (tokenMatches.length > 0) return tokenMatches

  const taskWantsTesting = taskIntents.has('testing')
  const cappedMediumOrHigh = recommended.filter((rule) => {
    if (rule.selectionMode === 'baseline') return false
    if (rule.confidenceLevel === 'low') return false
    if (taskWantsTesting) return true
    const ruleIntents = computeRuleIntents(rule)
    const isTestingOnly = ruleIntents.size > 0 && [...ruleIntents].every((i) => i === 'testing')
    return !isTestingOnly
  })
  return cappedMediumOrHigh.slice(0, 8)
}

/** Semantic categories a task can belong to, used to filter catalog rules to only relevant ones. */
export type TaskIntent =
  | 'backend'
  | 'frontend'
  | 'admin-ui'
  | 'storefront'
  | 'graphql'
  | 'database'
  | 'auth'
  | 'testing'
  | 'docs'
  | 'monorepo'

/** Ordered list of all valid TaskIntent values for iteration. */
export const ALL_INTENTS: readonly TaskIntent[] = [
  'backend',
  'frontend',
  'admin-ui',
  'storefront',
  'graphql',
  'database',
  'auth',
  'testing',
  'docs',
  'monorepo',
]

/**
 * Deterministic keyword -> intent table. Matching is word-aware: the task
 * string is lowercased and every non-alphanumeric character is normalized to a
 * single space, then keywords are matched as space-padded substrings. This
 * means `unit-test`, `e2e-test`, `docs:`, `tanstack.query`, etc. all match
 * the same as `unit test`, `docs`, `tanstack query` without leaking into
 * different intents.
 *
 * A task may classify to multiple intents.
 */
const TASK_INTENT_KEYWORDS: Record<TaskIntent, string[]> = {
  backend: [
    'api',
    'endpoint',
    'controller',
    'service',
    'queue',
    'job',
    'worker',
    'cron',
    'middleware',
    'resolver',
    'migration',
    'seeder',
    'model',
    'repository',
    'handler',
    'plugin',
    'webhook',
    'schedule',
    'background',
    'consumer',
    'producer',
    'command',
    'nova resource',
    'api mutation',
    'api subscription',
  ],
  frontend: [
    'component',
    'page',
    'route',
    'view',
    'layout',
    'form',
    'dashboard',
    'modal',
    'navbar',
    'navigation',
    'sidebar',
    'menu',
    'tailwind',
    'scss',
    'style',
    'theme',
    'tanstack',
    'shadcn',
    'radix',
    'block',
    'client component',
    'server component',
  ],
  'admin-ui': [
    'admin',
    'admin-ui',
    'admin ui',
    'backoffice',
    'back-office',
    'back office',
    'nova',
    'control panel',
    'wp-admin',
    'vendure admin',
  ],
  storefront: [
    'storefront',
    'checkout',
    'cart',
    'product page',
    'product listing',
    'category page',
    'shop',
    'ecommerce',
    'e-commerce',
    'order page',
  ],
  graphql: ['graphql', 'resolver', 'graphql mutation', 'graphql subscription', 'schema', 'codegen'],
  database: [
    'database',
    'migration',
    'seed',
    'table',
    'index',
    'elasticsearch',
    'postgres',
    'mariadb',
    'mssql',
    'sql query',
    'db query',
  ],
  auth: [
    'auth',
    'login',
    'logout',
    'oauth',
    'oidc',
    'bankid',
    'azure ad',
    'session',
    'jwt',
    'permission',
    'rbac',
    'acl',
    'guard',
    'saml',
  ],
  testing: [
    'test',
    'tests',
    'testing',
    'spec',
    'e2e',
    'unit',
    'story',
    'stories',
    'snapshot',
    'fixture',
    'playwright',
    'cypress',
    'phpunit',
    'vitest',
  ],
  docs: ['doc', 'docs', 'documentation', 'readme', 'guide', 'tutorial', 'changelog'],
  monorepo: [
    'lib',
    'library',
    'package',
    'workspace',
    'shared',
    'monorepo',
    'nx',
    'turbo',
    'pnpm workspace',
    'yarn workspace',
  ],
}

function normalizeTaskForMatching(task: string): string {
  return ` ${task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/** Classify a free-text task description into the set of TaskIntents it implies. */
export function classifyTaskIntents(task: string): Set<TaskIntent> {
  const t = normalizeTaskForMatching(task)
  const intents = new Set<TaskIntent>()
  for (const intent of ALL_INTENTS) {
    const keywords = TASK_INTENT_KEYWORDS[intent]
    for (const kw of keywords) {
      const needle = ` ${kw} `
      if (t.includes(needle)) {
        intents.add(intent)
        break
      }
    }
  }
  return intents
}

/**
 * Map a rule's catalog metadata (tags + ecosystem) to the set of task intents
 * it can legitimately satisfy. Returns empty set when no metadata is available
 * (legacy schema), allowing the caller to fall back to keyword matching.
 */
export function computeRuleIntents(rule: {
  id: string
  tags?: string[]
  ecosystem?: string
}): Set<TaskIntent> {
  const intents = new Set<TaskIntent>()
  const tags = new Set((rule.tags ?? []).map((t) => t.toLowerCase()))
  const eco = rule.ecosystem

  if (!eco && tags.size === 0) return intents

  // Testing rules are isolated: only the testing intent applies. This prevents
  // testing tooling from bleeding into implementation tasks (e.g. PHPUnit in
  // "add queue job", Playwright in "build dashboard route").
  const isTestingRule =
    tags.has('playwright') ||
    tags.has('phpunit') ||
    tags.has('testing-library') ||
    tags.has('storybook') ||
    tags.has('testing')
  if (isTestingRule) {
    intents.add('testing')
    return intents
  }

  // Ecosystem -> primary intents.
  if (eco === 'laravel' || eco === 'nestjs' || eco === 'dotnet') {
    intents.add('backend')
  }
  if (eco === 'vendure') {
    intents.add('backend')
    intents.add('admin-ui')
  }
  if (eco === 'wordpress') {
    intents.add('backend')
    intents.add('frontend')
    intents.add('admin-ui')
  }
  if (eco === 'nextjs' || eco === 'react' || eco === 'vue') {
    intents.add('frontend')
    intents.add('admin-ui')
    intents.add('storefront')
  }
  // Styling and build tool ecosystems are frontend-scoped.
  if (eco === 'tailwind' || eco === 'vite') {
    intents.add('frontend')
  }
  if (eco === 'nx' || eco === 'turbo') {
    intents.add('monorepo')
  }

  // Direct semantic tags expressed in the manifest.
  if (tags.has('backend')) intents.add('backend')
  if (tags.has('frontend')) intents.add('frontend')
  if (tags.has('graphql')) intents.add('graphql')
  if (tags.has('laravel-nova')) intents.add('admin-ui')
  if (tags.has('oidc') || tags.has('azure-ad') || tags.has('bankid')) intents.add('auth')
  if (
    tags.has('postgresql') ||
    tags.has('mariadb') ||
    tags.has('mssql') ||
    tags.has('elasticsearch')
  ) {
    intents.add('database')
  }
  if (tags.has('nx21') || tags.has('turbo') || tags.has('yarn4') || tags.has('pnpm89')) {
    intents.add('monorepo')
  }

  return intents
}
