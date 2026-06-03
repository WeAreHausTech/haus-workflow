/** Detection helpers for the scanner: dependency collection, role finalization, status. */

import path from 'node:path'

import { SENSITIVE_PATH_REGEXES } from '../security/sensitive-paths.js'
import type { ContextMap } from '../types.js'
import { isRecord } from '../utils/audit-checks.js'

/**
 * Marker files whose presence signals an ecosystem haus does not support. Mapped to a
 * short signal name surfaced in ContextMap.unsupportedSignals and the unsupported-repo
 * messaging. Presence only — contents are never inspected for detection.
 */
export const UNSUPPORTED_MARKERS: Record<string, string> = {
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  Gemfile: 'ruby',
}

/** Stack names that are not, on their own, evidence of a supported stack. */
const WEAK_STACK_SIGNALS = new Set(['missing-prettier', 'missing-eslint'])

/**
 * Classifies how confidently haus recognises the repo. `unknown` when no role and no
 * meaningful stack signal were found (the package-manager bucket and the missing-tool
 * markers do not count); `partial` when real signals coexist with unsupported-ecosystem
 * markers; `supported` otherwise.
 */
export function computeDetectionStatus(
  roles: string[],
  stacks: Record<string, string[]>,
  unsupportedSignals: string[],
): ContextMap['detectionStatus'] {
  const hasRealStack = Object.entries(stacks).some(
    ([bucket, names]) =>
      bucket !== 'packageManagers' && names.some((n) => !WEAK_STACK_SIGNALS.has(n)),
  )
  const hasRealSignal = roles.length > 0 || hasRealStack
  if (!hasRealSignal) return 'unknown'
  return unsupportedSignals.length > 0 ? 'partial' : 'supported'
}

/** Returns true when a relative file path matches any sensitive-path regex. */
export function blocked(rel: string): boolean {
  return SENSITIVE_PATH_REGEXES.some((x) => x.test(rel))
}

/**
 * Merges all dependency keys from package.json (dependencies + devDependencies)
 * and composer.json (require + require-dev) into a single sorted array.
 */
export function dependencySet(
  pkg?: Record<string, unknown>,
  composer?: Record<string, unknown>,
): string[] {
  const depNames = new Set<string>()
  const pushObj = (obj: unknown) => {
    if (!isRecord(obj)) return
    for (const key of Object.keys(obj)) depNames.add(key)
  }
  pushObj(pkg?.dependencies)
  pushObj(pkg?.devDependencies)
  pushObj(composer?.require)
  pushObj(composer?.['require-dev'])
  return [...depNames].sort()
}

/**
 * Applies the WordPress role precedence that the registry does not model, then sorts.
 * Bedrock layout (web/app path or roots/wordpress dep) wins over vanilla; both variants
 * also add the generic "wordpress-site" role. All other roles come from the registry.
 *
 * @param registryRoles - Roles already detected by {@link runDetection}.
 * @param deps - Flat dependency list (npm + composer).
 * @param files - Safe, non-sensitive file paths relative to the project root.
 */
export function finalizeRoles(registryRoles: string[], deps: string[], files: string[]): string[] {
  const roles = new Set(registryRoles)
  const hasWpConfig = files.some((f) => f.endsWith('wp-config.php'))
  const hasBedrockLayout =
    files.some((f) => f.includes('web/app')) || deps.includes('roots/wordpress')
  if (hasWpConfig && hasBedrockLayout) {
    roles.add('wordpress-bedrock-site')
    roles.add('wordpress-site')
  } else if (hasWpConfig) {
    roles.add('wordpress-vanilla-site')
    roles.add('wordpress-site')
  } else if (deps.includes('roots/wordpress')) {
    roles.add('wordpress-bedrock-site')
    roles.add('wordpress-site')
  }
  return [...roles].sort()
}

/** Collects the deduped, sorted unsupported-ecosystem signals from the safe file list. */
export function collectUnsupportedSignals(files: string[]): string[] {
  return [
    ...new Set(
      files
        .map((f) => UNSUPPORTED_MARKERS[path.basename(f)])
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort()
}
