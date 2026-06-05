/**
 * Core project scanner — reads package.json, composer.json, and safe project files,
 * then writes five outputs to .haus-workflow/: context-map.json, dependency-map.json,
 * scan-hashes.json, repo-summary.md, and sources-report.json.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { ContextMap } from '../types.js'
import { isRecord } from '../utils/audit-checks.js'
import {
  hashText,
  listFiles,
  mapWithConcurrency,
  readJson,
  writeJson,
  writeText,
} from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'
import { satisfiesVersion } from '../utils/versions.js'

import { detectPackageManager } from './detect-package-manager.js'
import { runDetection } from './detection-registry.js'
import {
  blocked,
  collectUnsupportedSignals,
  computeDetectionStatus,
  dependencySet,
  finalizeRoles,
} from './detection.js'
import { buildContentBlob, renderSummary } from './render.js'
import type { ScanResult } from './types.js'
import { writeSourcesReport } from './write-sources-report.js'

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

  const unsupportedSignals = collectUnsupportedSignals(safeFiles)
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
  // Bounded fan-out: hashing every safe file with an unbounded Promise.all opens one
  // descriptor per file at once and can hit EMFILE on low fd ulimits. mapWithConcurrency
  // batches the reads (same guard render.ts uses for the content blob).
  const scanHashes = Object.fromEntries(
    await mapWithConcurrency(
      safeFiles,
      async (f) => [f, hashText(await readFile(path.join(root, f), 'utf8'))] as const,
    ),
  )
  const repoSummary = renderSummary(context)

  await writeJson(hausPath(root, 'context-map.json'), context)
  await writeJson(hausPath(root, 'dependency-map.json'), dependencyMap)
  await writeJson(hausPath(root, 'scan-hashes.json'), scanHashes)
  await writeText(hausPath(root, 'repo-summary.md'), repoSummary)
  await writeSourcesReport(root)

  return { ...context, dependencyMap, scanHashes, repoSummary }
}
