/** Ecosystem detection + backend-conflict logic for the recommender. */

/** Maps ecosystem names to the repo roles that indicate that ecosystem is present. */
export const ECOSYSTEM_GROUPS: Record<string, string[]> = {
  laravel: ['laravel-app', 'laravel-nova-app'],
  wordpress: ['wordpress-site', 'wordpress-bedrock-site', 'wordpress-vanilla-site'],
  vendure: ['vendure-app', 'vendure-plugin'],
  nestjs: ['nestjs-api'],
  nextjs: ['next-app'],
  react: ['react-app', 'next-app', 'design-system'],
  vue: ['vue-app'],
  dotnet: ['dotnet-service'],
  nx: ['nx-monorepo'],
  turbo: ['turbo-monorepo'],
}

/** Backend ecosystems that can act as a dominant backend for conflict detection. */
export const ECOSYSTEM_PRIMARY_BACKENDS = new Set([
  'laravel',
  'wordpress',
  'vendure',
  'nestjs',
  'dotnet',
])

/**
 * Which backend ecosystems are compatible inside a given dominant backend.
 * A backend ecosystem not listed for the dominant ecosystem triggers ecosystem-conflict penalty.
 * Example: a Vendure repo legitimately uses NestJS rules; a Laravel repo does not.
 */
export const ECOSYSTEM_COMPATIBLE_BACKENDS: Record<string, Set<string>> = {
  vendure: new Set(['vendure', 'nestjs']),
  nestjs: new Set(['nestjs']),
  laravel: new Set(['laravel']),
  wordpress: new Set(['wordpress']),
  dotnet: new Set(['dotnet']),
}

/** Derive the set of active ecosystems from the repo's detected roles. */
export function inferRepoEcosystems(roles: string[]): string[] {
  const ecosystems = new Set<string>()
  for (const [eco, roleList] of Object.entries(ECOSYSTEM_GROUPS)) {
    if (roleList.some((r) => roles.includes(r))) ecosystems.add(eco)
  }
  return [...ecosystems]
}

/** Return the first backend ecosystem in the list, used as the conflict-detection anchor. */
export function pickDominantBackend(ecosystems: string[]): string | undefined {
  for (const eco of ecosystems) {
    if (ECOSYSTEM_PRIMARY_BACKENDS.has(eco)) return eco
  }
  return undefined
}

export function isBackendEcosystem(eco: string): boolean {
  return ECOSYSTEM_PRIMARY_BACKENDS.has(eco)
}
