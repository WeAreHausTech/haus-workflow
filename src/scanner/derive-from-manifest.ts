/**
 * Anti-drift bridge between the catalog manifest and the detection registry.
 *
 * The recommender already matches catalog items by raw dependency / role / stack, so an
 * item is "recognisable" when at least one of its requiresAny clauses can be satisfied by
 * a real repo: any `dependency` or `packageNamePattern` clause (matched against raw deps),
 * a `role` clause whose role the scanner can emit, or a `stack` clause whose token the
 * detection registry can produce.
 *
 * {@link unrecognisableItems} powers a coverage test: the moment the catalog ships an item
 * the scanner could never recognise (e.g. a brand-new stack token with no dependency
 * clause and no registry rule), the test fails — forcing either a registry rule or a
 * dependency-backed clause. This keeps the scanner and catalog from silently drifting.
 */

import type { CatalogItem, RequiresAnyClause } from '../types.js'

import { ROLE_RULES, STACK_RULES } from './detection-registry.js'

// Stack names the package-manager post-pass adds in scan-project.ts (not in STACK_RULES).
const PACKAGE_MANAGER_STACKS = ['yarn4', 'pnpm89']
// WordPress roles resolved by scan-project's finalizeRoles (not in ROLE_RULES).
const WORDPRESS_ROLES = ['wordpress-site', 'wordpress-bedrock-site', 'wordpress-vanilla-site']
/** Roles satisfied via deep-context.json or explicit opt-in — not shallow scanner signals. */
const DEEP_CONTEXT_ROLES = new Set([
  'skill-authoring',
  'subagent-workflow',
  'user-gate',
  'code-review',
  'isolated-branch',
  'branch-completion',
  'tdd-workflow',
  'performance-review',
  'refactor-cleanup',
  'ui-design',
  'incident-trace',
  'laravel-plugins',
  'redis-ops',
  'database',
  'security-review',
  'e2e-authoring',
  'build-failure',
])

/** Stack tokens the scanner can produce (registry rules + package-manager bucket). */
export function producibleStacks(): Set<string> {
  const names = STACK_RULES.map((r) => r.stack?.[1]).filter((n): n is string => Boolean(n))
  return new Set([...names, ...PACKAGE_MANAGER_STACKS])
}

/** Repo roles the scanner can emit (registry role rules + WordPress precedence roles). */
export function knownRoles(): Set<string> {
  const roles = ROLE_RULES.map((r) => r.role).filter((r): r is string => Boolean(r))
  return new Set([...roles, ...WORDPRESS_ROLES])
}

/** True when at least one requiresAny clause of the item can be satisfied by a real repo. */
export function isItemRecognisable(
  item: { requiresAny?: RequiresAnyClause[] },
  stacks: Set<string> = producibleStacks(),
  roles: Set<string> = knownRoles(),
): boolean {
  const clauses = item.requiresAny ?? []
  // No constraint means the item is always eligible (e.g. baseline/default items).
  if (clauses.length === 0) return true
  return clauses.some(
    (c) =>
      'dependency' in c ||
      'packageNamePattern' in c ||
      ('role' in c && (roles.has(c.role) || DEEP_CONTEXT_ROLES.has(c.role))) ||
      ('stack' in c && stacks.has(c.stack)),
  )
}

/** Returns the catalog items the scanner could never recognise (empty = no drift). */
export function unrecognisableItems(items: CatalogItem[]): CatalogItem[] {
  const stacks = producibleStacks()
  const roles = knownRoles()
  return items.filter((item) => !isItemRecognisable(item, stacks, roles))
}
