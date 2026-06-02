/**
 * Core project scanner — reads package.json, composer.json, and safe project files,
 * then writes four outputs to .haus-workflow/: context-map.json, dependency-map.json,
 * scan-hashes.json, and repo-summary.md.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { SENSITIVE_PATH_REGEXES } from '../security/sensitive-paths.js'
import type { ContextMap } from '../types.js'
import { isRecord } from '../utils/audit-checks.js'
import { hashText, listFiles, readJson, writeJson, writeText } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'
import { satisfiesVersion } from '../utils/versions.js'

import { detectPackageManager } from './detect-package-manager.js'
import { runDetection } from './detection-registry.js'
import type { ScanResult } from './types.js'

/**
 * Allowlist of file globs that are safe to read during a scan.
 * Keeping an explicit list prevents accidental ingestion of large generated
 * directories (node_modules, .git) and limits the attack surface for path
 * traversal if the repo contains unexpected symlinks.
 */
const SAFE_FILES = [
  'package.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.json',
  'composer.lock',
  'nx.json',
  'turbo.json',
  'tsconfig.json',
  'vite.config.*',
  'next.config.*',
  'tailwind.config.*',
  'components.json',
  'playwright.config.*',
  'phpunit.xml',
  'artisan',
  'routes/*.php',
  'app/Providers/*.php',
  'schema.graphql',
  '**/*.graphql',
  '**/vendure-config.*',
  '**/*module.ts',
  'web/app/**',
  'wp-content/plugins/**',
  'wp-content/themes/**',
  'wp-content/mu-plugins/**',
  'wp-content/acf-json/**',
  '.storybook/**',
  '.env.example',
  'wp-config.php',
  '**/*.csproj',
  '**/*.sln',
  'docker-compose.*',
  'Dockerfile',
  // Unsupported-ecosystem markers — matched by PRESENCE only (never content-read; none
  // match the content-blob extensions). Drive detectionStatus / unsupportedSignals.
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
]

/**
 * Marker files whose presence signals an ecosystem haus does not support. Mapped to a
 * short signal name surfaced in ContextMap.unsupportedSignals and the unsupported-repo
 * messaging. Presence only — contents are never inspected for detection.
 */
const UNSUPPORTED_MARKERS: Record<string, string> = {
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
function computeDetectionStatus(
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
function blocked(rel: string): boolean {
  return SENSITIVE_PATH_REGEXES.some((x) => x.test(rel))
}

/**
 * Scans the project at `root` and writes four output files to `.haus-workflow/`.
 *
 * Outputs written:
 * - `context-map.json` — full ContextMap (roles, stacks, warnings, …)
 * - `dependency-map.json` — flat dep lists by ecosystem (node, composer)
 * - `scan-hashes.json` — SHA-256 of every scanned file for drift detection
 * - `repo-summary.md` — human-readable one-page summary
 *
 * @param root - Absolute path to the project root.
 * @param mode - `"fast"` skips interactive prompts; `"guided"` enables them.
 * @returns The full ScanResult including all four artifact fields.
 */
export async function scanProject(
  root: string,
  mode: 'guided' | 'fast' = 'fast',
): Promise<ScanResult> {
  const pkg = await readJson<Record<string, unknown>>(path.join(root, 'package.json'))
  const composer = await readJson<Record<string, unknown>>(path.join(root, 'composer.json'))
  const files = await listFiles(root, SAFE_FILES)
  // Remove any file that matched a SAFE_FILES glob but is still sensitive (e.g. a
  // symlink resolving to a .env file, or an uploads dir matched by a wildcard).
  const safeFiles = files.filter((f) => !blocked(f))
  const deps = dependencySet(pkg, composer)
  const packageManager = detectPackageManager(root, String(pkg?.packageManager ?? ''))
  const contentBlob = await buildContentBlob(root, safeFiles)
  const detection = runDetection({ deps: new Set(deps), files: safeFiles, contentBlob })
  const roles = finalizeRoles(detection.roles, deps, safeFiles)
  const stacks = detection.stacks
  // Package-manager bucket is input-driven (resolved PM), not a dep/file signal.
  if (packageManager === 'yarn') stacks.packageManagers.push('yarn4')
  if (packageManager === 'pnpm') stacks.packageManagers.push('pnpm89')
  const warnings: string[] = []
  const securityRisks: string[] = []
  const crossRepoHints: string[] = []
  if (!safeFiles.some((f) => f.endsWith('.env.example'))) warnings.push('No .env.example found')
  if (!(pkg && isRecord(pkg.scripts) && String(pkg.scripts.test ?? '').length > 0))
    warnings.push('No package.json test script found')
  const nodeEngine = isRecord(pkg?.engines) ? String(pkg.engines.node ?? '') : ''
  if (nodeEngine && !satisfiesVersion(process.version, nodeEngine)) {
    warnings.push(`Current Node ${process.version} does not satisfy package engine ${nodeEngine}`)
  }
  if (safeFiles.some((f) => f.includes('docker-compose')))
    crossRepoHints.push('Containerized services detected')
  if (safeFiles.some((f) => f.includes('turbo.json') || f.includes('nx.json')))
    crossRepoHints.push('Monorepo orchestration detected')
  if (!safeFiles.some((f) => f.endsWith('.env.example'))) securityRisks.push('Missing env template')
  if (safeFiles.some((f) => f.includes('wp-content/uploads')))
    securityRisks.push('Uploads directory present')

  const unsupportedSignals = [
    ...new Set(
      safeFiles
        .map((f) => UNSUPPORTED_MARKERS[path.basename(f)])
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort()
  // detectionStatus / unsupportedSignals are structured fields — the recommender and
  // doctor render the human-facing message from them, so no prose warning is pushed here.
  const detectionStatus = computeDetectionStatus(roles, stacks, unsupportedSignals)

  const context: ContextMap = {
    mode,
    generatedAt: new Date().toISOString(),
    root,
    repoName: String(pkg?.name ?? path.basename(root)),
    packageManager,
    repoRoles: roles,
    confidence: computeConfidence(roles, stacks),
    detectedStacks: stacks,
    dependencies: deps,
    securityRisks,
    crossRepoHints,
    warnings,
    detectionStatus,
    unsupportedSignals,
  }

  const dependencyMap = {
    node: deps.filter((d) => !d.includes('/')),
    composer: isRecord(composer?.require) ? Object.keys(composer.require) : [],
  }
  const scanHashes = Object.fromEntries(
    await Promise.all(
      safeFiles.map(
        async (f) => [f, hashText(await readFile(path.join(root, f), 'utf8'))] as const,
      ),
    ),
  )
  const repoSummary = renderSummary(context)

  await writeJson(hausPath(root, 'context-map.json'), context)
  await writeJson(hausPath(root, 'dependency-map.json'), dependencyMap)
  await writeJson(hausPath(root, 'scan-hashes.json'), scanHashes)
  await writeText(hausPath(root, 'repo-summary.md'), repoSummary)

  return { ...context, dependencyMap, scanHashes, repoSummary }
}

/**
 * Merges all dependency keys from package.json (dependencies + devDependencies)
 * and composer.json (require + require-dev) into a single sorted array.
 */
function dependencySet(
  pkg?: Record<string, unknown>,
  composer?: Record<string, unknown>,
): string[] {
  const out = new Set<string>()
  const pushObj = (obj: unknown) => {
    if (!isRecord(obj)) return
    for (const key of Object.keys(obj)) out.add(key)
  }
  pushObj(pkg?.dependencies)
  pushObj(pkg?.devDependencies)
  pushObj(composer?.require)
  pushObj(composer?.['require-dev'])
  return [...out].sort()
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
function finalizeRoles(registryRoles: string[], deps: string[], files: string[]): string[] {
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

/**
 * Builds a single content blob from the first 300 candidate files (code/config
 * extensions), read ONCE. The registry's `content` signals search this blob instead of
 * re-reading every file per needle. The 300-file cap keeps scan time predictable on
 * large monorepos; files are joined with newlines so no needle matches across a boundary.
 *
 * @param root - Absolute project root.
 * @param files - Full safe file list; filtered internally to code/config extensions.
 */
async function buildContentBlob(root: string, files: string[]): Promise<string> {
  const candidates = files.filter(
    (f) =>
      f.endsWith('.ts') ||
      f.endsWith('.js') ||
      f.endsWith('.php') ||
      f.endsWith('.json') ||
      f.endsWith('.yml') ||
      f.endsWith('.yaml'),
  )
  const parts = await Promise.all(
    candidates.slice(0, 300).map(async (rel) => {
      try {
        return await readFile(path.join(root, rel), 'utf8')
      } catch {
        // File may have been deleted or be unreadable — skip and continue.
        return ''
      }
    }),
  )
  return parts.join('\n')
}

/**
 * Computes a 0–0.99 confidence score based on how many roles and stack entries
 * were detected.  More signals → higher confidence.
 * Formula: 0.4 base + 0.08 per role + 0.02 per stack entry, capped at 0.99.
 * Returns 0.15 when no roles were found (minimal signal).
 */
function computeConfidence(roles: string[], stacks: Record<string, string[]>): number {
  const stackCount = Object.values(stacks).reduce((sum, arr) => sum + arr.length, 0)
  if (roles.length === 0) return 0.15
  return Math.min(0.99, Number((0.4 + roles.length * 0.08 + stackCount * 0.02).toFixed(2)))
}

/** Renders a concise markdown summary of the context map for repo-summary.md. */
function renderSummary(context: ContextMap): string {
  return `# Repo summary

- Repo: ${context.repoName}
- Package manager: ${context.packageManager}
- Roles: ${context.repoRoles.join(', ') || 'unknown'}
- Generated: ${context.generatedAt}
`
}
