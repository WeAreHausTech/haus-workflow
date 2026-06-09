/** `haus validate-catalog` — validates a catalog manifest at an explicit path for use in catalog repo CI. */
import fs from 'node:fs'
import path from 'node:path'

import {
  auditForbiddenTagsInText,
  extractFrontmatterDescription,
} from '../catalog/forbidden-content.js'
import {
  ANY_NPX_PATTERN,
  ALLOWED_NPX_PATTERN,
  auditDisallowedTags,
  BANNED_AGENT_PHRASES,
  FORBIDDEN_TAGS,
  HTTP_URL_PATTERN,
  PLACEHOLDER_PATTERN,
  REQUIRED_AGENT_SECTIONS,
  REQUIRED_SKILL_FRONTMATTER,
  RISKY_INSTALL_PATTERNS,
} from '../catalog/validation-rules.js'
import type { CatalogItem } from '../types.js'
import { readJson } from '../utils/fs.js'
import { error, log } from '../utils/logger.js'

function auditForbiddenStacks(items: CatalogItem[]): string[] {
  const failures: string[] = []
  for (const item of items) {
    const tags = Array.isArray(item.tags) ? item.tags : []
    const text = `${item.id} ${tags.join(' ')}`.toLowerCase()
    for (const word of FORBIDDEN_TAGS) {
      if (text.includes(word)) failures.push(`${item.id}: unsupported stack/tag "${word}"`)
    }
  }
  return failures
}

function auditManifestStructure(items: CatalogItem[]): string[] {
  const failures: string[] = []
  const seenIds = new Map<string, number>()
  const seenPaths = new Map<string, string>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!

    if (!item.id) {
      failures.push(`item[${i}]: missing id`)
      continue
    }
    if (!item.type) {
      failures.push(`${item.id}: missing type`)
      continue
    }
    if (!item.source) {
      failures.push(`${item.id}: missing source`)
    }
    if (!item.title) {
      failures.push(`${item.id}: missing title`)
    }

    const prev = seenIds.get(item.id)
    if (prev !== undefined) {
      failures.push(`${item.id}: duplicate id (first at index ${prev})`)
    } else {
      seenIds.set(item.id, i)
    }

    if (
      item.type === 'skill' ||
      item.type === 'agent' ||
      item.type === 'template' ||
      item.type === 'command'
    ) {
      if (!item.path) {
        failures.push(`${item.id}: missing path`)
      } else {
        const norm = item.path.replace(/\\/g, '/')
        const existing = seenPaths.get(norm)
        if (existing) {
          failures.push(`${item.id}: path "${norm}" already used by ${existing}`)
        } else {
          seenPaths.set(norm, item.id)
        }
      }

      const isHaus = item.source === 'haus'
      const isCuratedApproved = item.source === 'curated' && item.reviewStatus === 'approved'
      if (!isHaus && !isCuratedApproved) {
        failures.push(`${item.id}: source must be "haus" or curated with reviewStatus "approved"`)
      }

      for (const ref of item.references ?? []) {
        if (HTTP_URL_PATTERN.test(ref)) {
          failures.push(`${item.id}: reference uses insecure http:// URL: ${ref}`)
        }
      }
    }
  }
  return failures
}

/**
 * Checks file existence, required sections, and banned phrases for each item.
 * Only runs when `manifestDir` is provided (i.e. the catalog files are on disk).
 */
function auditShippedFiles(manifestDir: string, items: CatalogItem[]): string[] {
  const failures: string[] = []
  for (const item of items) {
    if (!item.path) continue
    const absPath = path.join(manifestDir, item.path)

    if (item.type === 'skill') {
      const skillMd = path.join(absPath, 'SKILL.md')
      if (!fs.existsSync(skillMd)) {
        failures.push(`${item.id}: missing ${path.relative(manifestDir, skillMd)}`)
        continue
      }
      const text = fs.readFileSync(skillMd, 'utf8')
      // Skills declare their when-signal via YAML frontmatter `description:`
      // (the superpowers convention), not prose section headers.
      const description = extractFrontmatterDescription(text)
      for (const key of REQUIRED_SKILL_FRONTMATTER) {
        if (key === 'description' && !description) {
          failures.push(`${item.id}: SKILL.md missing non-empty frontmatter 'description:'`)
        }
      }
      failures.push(
        ...auditForbiddenTagsInText(text, `${item.id}: ${path.relative(manifestDir, skillMd)}`),
      )
    } else if (item.type === 'agent') {
      if (!fs.existsSync(absPath)) {
        failures.push(`${item.id}: missing agent file ${item.path}`)
        continue
      }
      const text = fs.readFileSync(absPath, 'utf8')
      if (!text.startsWith('---')) failures.push(`${item.id}: agent file missing YAML frontmatter`)
      for (const section of REQUIRED_AGENT_SECTIONS) {
        if (!text.includes(section)) failures.push(`${item.id}: agent file missing ${section}`)
      }
      const lower = text.toLowerCase()
      for (const phrase of BANNED_AGENT_PHRASES) {
        if (lower.includes(phrase))
          failures.push(`${item.id}: agent file contains disallowed phrase "${phrase}"`)
      }
      failures.push(
        ...auditForbiddenTagsInText(text, `${item.id}: ${path.relative(manifestDir, absPath)}`),
      )
    } else if (item.type === 'template') {
      if (!fs.existsSync(absPath)) {
        failures.push(`${item.id}: missing template file ${item.path}`)
        continue
      }
      failures.push(...auditTemplateContent(manifestDir, absPath, item.id))
    } else if (item.type === 'command') {
      if (!fs.existsSync(absPath)) {
        failures.push(`${item.id}: missing command file ${item.path}`)
        continue
      }
      failures.push(...auditTemplateContent(manifestDir, absPath, item.id))
    }
  }
  return failures
}

function auditTemplateContent(manifestDir: string, absPath: string, itemId: string): string[] {
  const rel = path.relative(manifestDir, absPath)
  const text = fs.readFileSync(absPath, 'utf8')
  const failures: string[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (PLACEHOLDER_PATTERN.test(line)) {
      failures.push(`${rel}:${i + 1}: TODO or placeholder in shipped content`)
    }
    if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line))) {
      failures.push(`${rel}:${i + 1}: risky install pattern`)
    }
    if (ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
      failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx allowed)`)
    }
  }
  failures.push(...auditForbiddenTagsInText(text, `${itemId}: ${rel}`))
  return failures
}

/**
 * Walks skills/ and agents/ dirs looking for placeholder markers and risky install patterns.
 * Only runs when the catalog directory is available on disk.
 */
function auditMarkdownContent(manifestDir: string): string[] {
  const failures: string[] = []
  const dirs = ['skills', 'agents', 'templates', 'commands']
  for (const dir of dirs) {
    const abs = path.join(manifestDir, dir)
    if (!fs.existsSync(abs)) continue
    walkMd(abs, (file) => {
      const text = fs.readFileSync(file, 'utf8')
      const rel = path.relative(manifestDir, file)
      // Repo-wide safety scan only. The TODO/placeholder check is an authoring-quality
      // guard, not a safety rule, and false-positives on legitimate prose, so it is not
      // run here — per-item shipped template/command audits still enforce it.
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line))) {
          failures.push(`${rel}:${i + 1}: risky install pattern`)
        }
        if (ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
          failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx allowed)`)
        }
      }
      if (!rel.includes('/references/')) {
        failures.push(...auditForbiddenTagsInText(text, rel))
      }
    })
  }
  return failures
}

function walkMd(dir: string, fn: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, fn)
    else if (entry.name.endsWith('.md')) fn(full)
  }
}

/**
 * `haus validate-catalog <manifest-path>`
 *
 * Validates a catalog manifest at an explicit path. Used by catalog repo CI:
 *   haus validate-catalog ./manifest.json
 *
 * When run from the catalog repo root, also validates file existence,
 * required sections, banned phrases, and risky install patterns.
 */
export async function runValidateCatalog(manifestPath: string | undefined): Promise<void> {
  if (!manifestPath) {
    error('Usage: haus validate-catalog <path/to/manifest.json>')
    process.exitCode = 1
    return
  }

  const abs = path.resolve(process.cwd(), manifestPath)
  const manifestDir = path.dirname(abs)
  const data = await readJson<{ items: CatalogItem[] }>(abs)
  if (!data?.items) {
    error(`Could not read catalog manifest at ${abs}`)
    process.exitCode = 1
    return
  }

  const items = data.items
  const structureFailures = auditManifestStructure(items)
  const stackFailures = auditForbiddenStacks(items)
  const fileFailures = auditShippedFiles(manifestDir, items)
  const contentFailures = auditMarkdownContent(manifestDir)

  // Allowlist (stacks + meta tags + pattern suffixes) comes from the synced
  // validation-rules.json, the same source the catalog repo validates against.
  const tagFailures = auditDisallowedTags(items)

  const allFailures = [
    ...structureFailures,
    ...stackFailures,
    ...fileFailures,
    ...contentFailures,
    ...tagFailures,
  ]
  if (allFailures.length) {
    allFailures.forEach((f) => error(f))
    process.exitCode = 1
    return
  }

  log(`Catalog valid. ${items.length} items checked.`)
}
