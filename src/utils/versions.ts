/** Semver utilities — normalise, compare, and assert version ranges for scanner dependency checks. */

import semver from 'semver'

/**
 * Coerce a loose version string (e.g. "14.x", "v16") into a canonical semver,
 * or return null if it cannot be parsed.
 */
export function normalizeVersion(version: string): string | null {
  return semver.valid(semver.coerce(version))
}

/**
 * Check whether `version` satisfies `range`.
 * Pre-release versions are included so callers don't need special-case handling.
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const normalized = normalizeVersion(version)
  if (!normalized) return false
  return semver.satisfies(normalized, range, { includePrerelease: true })
}

/** Compare two version strings; throws if either is not a valid semver. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const normalizedA = normalizeVersion(a)
  const normalizedB = normalizeVersion(b)
  if (!normalizedA || !normalizedB) {
    throw new Error(`Cannot compare invalid versions: ${a} vs ${b}`)
  }
  return semver.compare(normalizedA, normalizedB) as -1 | 0 | 1
}

/** Throw a descriptive error if `version` does not satisfy `range`, used for hard dependency checks. */
export function assertVersionSatisfies(name: string, version: string, range: string): void {
  if (!satisfiesVersion(version, range)) {
    throw new Error(`${name} version ${version} does not satisfy required range ${range}`)
  }
}
