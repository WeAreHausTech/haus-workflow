/**
 * Core project scanner — reads package.json, composer.json, and safe project files,
 * then writes four outputs to .haus-workflow/: context-map.json, dependency-map.json,
 * scan-hashes.json, and repo-summary.md.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { SENSITIVE_PATH_REGEXES } from '../security/sensitive-paths.js'
import type { ContextMap, PackageManager } from '../types.js'
import { isRecord } from '../utils/audit-checks.js'
import { hashText, listFiles, readJson, writeJson, writeText } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'
import { satisfiesVersion } from '../utils/versions.js'

import { detectPackageManager } from './detect-package-manager.js'
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
]

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
  const roles = detectRoles(deps, safeFiles)
  const stacks = await detectStacks(root, deps, safeFiles, packageManager)
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
 * Derives high-level repo roles from dependency presence and file heuristics.
 * Each role is a short string (e.g. "next-app", "laravel-app") consumed by the
 * recommender to select catalog items.  A repo can have multiple roles.
 *
 * @param deps - Flat list of all dependency keys (npm + composer).
 * @param files - Safe, non-sensitive file paths relative to the project root.
 */
function detectRoles(deps: string[], files: string[]): string[] {
  const roles = new Set<string>()
  if (deps.includes('next') || files.some((f) => f.includes('next.config.'))) roles.add('next-app')
  if (deps.includes('react')) roles.add('react-app')
  if (deps.includes('vite') || files.some((f) => f.includes('vite.config.'))) roles.add('vite-app')
  if (deps.includes('react-router') && deps.includes('@react-router/node'))
    roles.add('react-router-app')
  if (deps.includes('sanity')) roles.add('sanity-studio')
  if (deps.includes('@strapi/strapi') || deps.some((d) => d.startsWith('@strapi/')))
    roles.add('strapi-app')
  if (deps.includes('expo')) roles.add('expo-app')
  if (deps.includes('@vendure/core')) roles.add('vendure-app')
  if (
    deps.some((d) => d.startsWith('@haus/vendure-')) ||
    files.some((f) => f.includes('vendure-config'))
  )
    roles.add('vendure-plugin')
  if (deps.includes('@nestjs/core')) roles.add('nestjs-api')
  if (deps.includes('graphql') || deps.includes('@nestjs/graphql')) roles.add('graphql-api')
  if (files.some((f) => f.endsWith('nx.json'))) roles.add('nx-monorepo')
  if (files.some((f) => f.endsWith('turbo.json'))) roles.add('turbo-monorepo')
  if (files.some((f) => f.endsWith('artisan')) || deps.includes('laravel/framework'))
    roles.add('laravel-app')
  if (deps.includes('laravel/nova')) roles.add('laravel-nova-app')
  // WordPress role detection: Bedrock layout (web/app path or roots/wordpress dep)
  // takes priority over vanilla; both variants also add the generic "wordpress-site" role.
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
  if (files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) roles.add('dotnet-service')
  if (deps.includes('express')) roles.add('express-service')
  return [...roles].sort()
}

/**
 * Categorises the tech stack into buckets (frontend, backend, databases, testing,
 * auth, tooling, packageManagers) by matching dependency names and key file paths.
 * Some entries (e.g. NestJS, Vendure) also do a content search via {@link hasNeedle}
 * to catch projects where the dep is a peer / not in package.json directly.
 *
 * @param root - Absolute project root, passed through to hasNeedle for file reads.
 * @param deps - Full dependency list (npm + composer).
 * @param files - Safe file paths relative to root.
 * @param packageManager - Already-resolved package manager, used to populate packageManagers bucket.
 */
async function detectStacks(
  root: string,
  deps: string[],
  files: string[],
  packageManager: PackageManager,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {
    backend: [],
    frontend: [],
    databases: [],
    testing: [],
    auth: [],
    tooling: [],
    packageManagers: [],
  }
  // Helper keeps buckets duplicate-free without requiring a Set.
  const add = (k: string, v: string) => {
    out[k] ??= []
    if (!out[k].includes(v)) out[k].push(v)
  }
  if (deps.includes('next')) add('frontend', 'nextjs')
  if (deps.includes('react')) add('frontend', 'react19')
  if (deps.includes('vue')) add('frontend', 'vue')
  if (deps.includes('vite')) add('frontend', 'vite8')
  if (deps.includes('react-router') && deps.includes('@react-router/node'))
    add('frontend', 'react-router-v7')
  if (deps.includes('tailwindcss') || files.some((f) => f.includes('tailwind.config.'))) {
    add('frontend', 'tailwindcss')
  }
  if (
    files.some((f) => f.endsWith('components.json')) &&
    deps.includes('class-variance-authority')
  ) {
    add('frontend', 'shadcn')
  }
  if (deps.includes('typescript')) add('tooling', 'typescript5')
  if (deps.includes('sanity') || deps.includes('next-sanity') || deps.includes('@sanity/client')) {
    add('backend', 'sanity')
  }
  if (deps.includes('@strapi/strapi') || deps.some((d) => d.startsWith('@strapi/'))) {
    add('backend', 'strapi')
  }
  if (deps.includes('prisma') || deps.includes('@prisma/client')) add('backend', 'prisma')
  if (deps.includes('expo')) add('frontend', 'expo')
  if (deps.includes('react-native')) add('frontend', 'react-native')
  if (deps.includes('i18next') || deps.includes('react-i18next')) add('tooling', 'i18next')
  if (deps.includes('bullmq')) add('tooling', 'bullmq')
  if (files.some((f) => f === 'Dockerfile' || f.startsWith('docker-compose')))
    add('tooling', 'docker')
  if (deps.includes('pm2') || files.some((f) => f.includes('ecosystem.config')))
    add('tooling', 'pm2')
  if (deps.some((d) => d.startsWith('@sentry/'))) add('tooling', 'sentry')
  if (deps.includes('deployer/deployer')) add('tooling', 'deployer-php')
  if (!deps.includes('prettier')) add('tooling', 'missing-prettier')
  if (!deps.includes('eslint')) add('tooling', 'missing-eslint')
  if (deps.includes('@stripe/stripe-js') || deps.includes('@stripe/react-stripe-js')) {
    add('tooling', 'stripe')
  }
  if (deps.includes('@haus-tech/qliro-plugin')) add('tooling', 'qliro')
  if (deps.includes('@supabase/supabase-js') || deps.some((d) => d.startsWith('@supabase/'))) {
    add('databases', 'supabase')
  }
  if (deps.includes('@vendure/core')) add('backend', 'vendure3')
  if (deps.includes('@nestjs/core')) add('backend', 'nestjs')
  // Content search for NestJS and Vendure because they may be installed as peers
  // without appearing in the top-level package.json (e.g. in a monorepo).
  if (await hasNeedle(root, files, 'NestFactory')) add('backend', 'nestjs')
  if (await hasNeedle(root, files, '@VendurePlugin')) add('backend', 'vendure3')
  if (deps.includes('graphql') || deps.includes('@nestjs/graphql')) add('backend', 'graphql')
  if (files.some((f) => f.endsWith('.graphql') || f.endsWith('schema.graphql')))
    add('backend', 'graphql')
  if (deps.includes('laravel/framework')) add('backend', 'laravel')
  if (files.some((f) => f.includes('app/Providers/') || f.includes('routes/')))
    add('backend', 'laravel')
  if (files.some((f) => f.endsWith('wp-config.php')) || deps.includes('roots/wordpress'))
    add('backend', 'wordpress')
  if (
    deps.includes('wpackagist-plugin/elementor') ||
    deps.includes('wearehaus/elementor-pro') ||
    deps.includes('wpackagist-theme/hello-elementor')
  ) {
    add('backend', 'elementor')
  }
  if (
    deps.includes('wearehaus/advanced-custom-fields-pro') ||
    deps.includes('wpackagist-plugin/advanced-custom-fields')
  ) {
    add('backend', 'acf-pro')
  }
  if (deps.includes('wearehaus/jet-engine')) add('backend', 'jetengine')
  if (deps.includes('wearehaus/jet-smart-filters')) add('backend', 'jetsmartfilters')
  if (deps.includes('wearehaus/gravityforms')) add('backend', 'gravityforms')
  if (files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) add('backend', 'dotnet')
  if (deps.includes('@playwright/test')) add('testing', 'playwright')
  if (files.some((f) => f.includes('.storybook'))) add('testing', 'storybook')
  if (deps.some((d) => d.startsWith('@testing-library/'))) add('testing', 'testing-library')
  if (files.some((f) => f.endsWith('phpunit.xml'))) add('testing', 'phpunit')
  if (deps.some((d) => d.startsWith('@storybook/'))) add('testing', 'storybook')
  if (deps.includes('vitest')) add('testing', 'vitest')
  if (deps.includes('jest') || deps.includes('jest-environment-jsdom')) add('testing', 'jest')
  if (deps.includes('pg')) add('databases', 'postgresql')
  if (deps.includes('mariadb') || deps.includes('mysql2')) add('databases', 'mariadb')
  if (deps.includes('mysql') || deps.includes('mysql2')) add('databases', 'mysql')
  if (deps.includes('mssql')) add('databases', 'mssql')
  if (deps.includes('@elastic/elasticsearch')) add('databases', 'elasticsearch')
  if (deps.includes('predis/predis') || deps.includes('ioredis') || deps.includes('redis')) {
    add('databases', 'redis')
  }
  // Auth detection uses content search because env-var names and import paths
  // are more reliable indicators than package names for these protocols.
  if (await hasNeedle(root, files, 'openid')) add('auth', 'oidc')
  if (await hasNeedle(root, files, 'AZURE_AD')) add('auth', 'azure-ad')
  if (await hasNeedle(root, files, 'BANKID')) add('auth', 'bankid')
  if (deps.includes('24slides/laravel-saml2') || deps.includes('aacotroneo/laravel-saml2')) {
    add('auth', 'saml2')
  }
  if (deps.includes('next-auth') || deps.includes('@auth/core')) add('auth', 'next-auth')
  if (packageManager === 'yarn') add('packageManagers', 'yarn4')
  if (packageManager === 'pnpm') add('packageManagers', 'pnpm89')
  return out
}

/**
 * Searches the first 300 candidate files for a literal string needle.
 * The 300-file cap keeps scan time predictable on large monorepos — content
 * search is only a fallback for cases where dep names are unreliable.
 *
 * @param root - Absolute project root.
 * @param files - Full safe file list; filtered internally to code/config extensions.
 * @param needle - Literal string to search for (case-sensitive).
 */
async function hasNeedle(root: string, files: string[], needle: string): Promise<boolean> {
  const candidates = files.filter(
    (f) =>
      f.endsWith('.ts') ||
      f.endsWith('.js') ||
      f.endsWith('.php') ||
      f.endsWith('.json') ||
      f.endsWith('.yml') ||
      f.endsWith('.yaml'),
  )
  for (const rel of candidates.slice(0, 300)) {
    try {
      const content = await readFile(path.join(root, rel), 'utf8')
      if (content.includes(needle)) return true
    } catch {
      // File may have been deleted or be unreadable — skip and continue.
      continue
    }
  }
  return false
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
