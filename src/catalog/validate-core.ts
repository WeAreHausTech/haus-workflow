import fs from 'node:fs'
import path from 'node:path'

import type { CatalogItem } from '../types.js'

import { auditForbiddenTagsInText, extractFrontmatterValue } from './forbidden-content.js'
import { validateCuratedProvenance, validateReferences } from './manifest-item-fields.js'
import {
  ALLOWED_NPX_PATTERN,
  ANY_NPX_PATTERN,
  auditDisallowedTags,
  FORBIDDEN_TAGS,
  NPX_TSX_ONLY_EXEMPT_TYPES,
  PLACEHOLDER_PATTERN,
  REQUIRED_SKILL_FRONTMATTER,
  RISKY_INSTALL_PATTERNS,
} from './validation-rules.js'

const ITEM_SEMVER_RE = /^\d+\.\d+\.\d+$/
const MANIFEST_SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/

export type ValidateCatalogResult = {
  ok: boolean
  failures: string[]
  items: CatalogItem[]
}

export function isSafeCatalogPath(itemPath: string): boolean {
  if (!itemPath || path.isAbsolute(itemPath) || itemPath.includes('\\')) return false
  const normalized = path.normalize(itemPath)
  return !normalized.startsWith('..') && !normalized.includes('/..')
}

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

function auditManifestStructure(manifestVersion: unknown, items: CatalogItem[]): string[] {
  const failures: string[] = []
  const seenIds = new Map<string, number>()
  const seenPaths = new Map<string, string>()

  if (typeof manifestVersion !== 'string' || !MANIFEST_SEMVER_RE.test(manifestVersion)) {
    failures.push(
      'manifest.json: top-level "version" is not valid semver (expected X.Y.Z or X.Y.Z-pre)',
    )
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!

    if (!item.id) {
      failures.push(`item[${i}]: missing id`)
      continue
    }

    const provenanceError = validateCuratedProvenance(item as Record<string, unknown>)
    if (provenanceError) failures.push(provenanceError)

    const referencesError = validateReferences(item.id, item.references)
    if (referencesError) failures.push(referencesError)

    if (!item.type) {
      failures.push(`${item.id}: missing type`)
      continue
    }
    if (!item.source) failures.push(`${item.id}: missing source`)
    if (!item.title) failures.push(`${item.id}: missing title`)
    if (item.version && !ITEM_SEMVER_RE.test(item.version)) {
      failures.push(`${item.id}: version "${item.version}" is not valid semver (expected X.Y.Z)`)
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
      item.type === 'command' ||
      item.type === 'config'
    ) {
      if (!item.path) {
        failures.push(`${item.id}: missing path`)
      } else if (!isSafeCatalogPath(item.path)) {
        failures.push(`${item.id}: path "${item.path}" is not a safe relative path`)
      } else {
        const norm = item.path.replace(/\\/g, '/')
        const existing = seenPaths.get(norm)
        if (existing) failures.push(`${item.id}: path "${norm}" already used by ${existing}`)
        else seenPaths.set(norm, item.id)
      }

      const isHaus = item.source === 'haus'
      const isCuratedUsableState =
        item.source === 'curated' &&
        (item.reviewStatus === 'approved' || item.reviewStatus === 'deprecated')
      if (!isHaus && !isCuratedUsableState) {
        failures.push(
          `${item.id}: source must be "haus" or curated with reviewStatus "approved"/"deprecated"`,
        )
      }
    }
  }
  return failures
}

function checkRequiredFrontmatter(text: string, label: string): string[] {
  const failures: string[] = []
  for (const key of REQUIRED_SKILL_FRONTMATTER) {
    if (!extractFrontmatterValue(text, key))
      failures.push(`${label}: missing non-empty frontmatter '${key}:'`)
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
    if (PLACEHOLDER_PATTERN.test(line))
      failures.push(`${rel}:${i + 1}: TODO or placeholder in shipped content`)
    if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line)))
      failures.push(`${rel}:${i + 1}: risky install pattern`)
    if (ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
      failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx allowed)`)
    }
  }
  failures.push(...auditForbiddenTagsInText(text, `${itemId}: ${rel}`))
  return failures
}

function auditShippedFiles(manifestDir: string, items: CatalogItem[]): string[] {
  const failures: string[] = []
  for (const item of items) {
    if (!item.path || !isSafeCatalogPath(item.path)) continue
    const absPath = path.join(manifestDir, item.path)
    if (item.type === 'skill') {
      const skillMd = path.join(absPath, 'SKILL.md')
      if (!fs.existsSync(skillMd)) {
        failures.push(`${item.id}: missing ${path.relative(manifestDir, skillMd)}`)
        continue
      }
      const text = fs.readFileSync(skillMd, 'utf8')
      failures.push(...checkRequiredFrontmatter(text, `${item.id}: SKILL.md`))
      failures.push(
        ...auditForbiddenTagsInText(text, `${item.id}: ${path.relative(manifestDir, skillMd)}`),
      )
    } else if (item.type === 'agent') {
      if (!fs.existsSync(absPath)) {
        failures.push(`${item.id}: missing agent file ${item.path}`)
        continue
      }
      const text = fs.readFileSync(absPath, 'utf8')
      const rel = path.relative(manifestDir, absPath)
      failures.push(...checkRequiredFrontmatter(text, `${item.id}: ${rel}`))
      failures.push(...auditForbiddenTagsInText(text, `${item.id}: ${rel}`))
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
      const text = fs.readFileSync(absPath, 'utf8')
      const rel = path.relative(manifestDir, absPath)
      failures.push(...checkRequiredFrontmatter(text, `${item.id}: ${rel}`))
      failures.push(...auditTemplateContent(manifestDir, absPath, item.id))
    } else if (item.type === 'config') {
      // Config items ship a file or a directory; verify the path exists. No
      // frontmatter/content audit — they are tooling files, not agent context.
      if (!fs.existsSync(absPath)) {
        failures.push(`${item.id}: missing config path ${item.path}`)
      }
    }
  }
  return failures
}

const DIR_ITEM_TYPE: Record<string, string> = {
  skills: 'skill',
  agents: 'agent',
  templates: 'template',
  commands: 'command',
}

function walkMd(dir: string, fn: (file: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(full, fn)
    else if (entry.name.endsWith('.md')) fn(full)
  }
}

function auditMarkdownContent(manifestDir: string): string[] {
  const failures: string[] = []
  for (const dir of ['skills', 'agents', 'templates', 'commands']) {
    const abs = path.join(manifestDir, dir)
    if (!fs.existsSync(abs)) continue
    const checkNonTsxNpx = !NPX_TSX_ONLY_EXEMPT_TYPES.includes(DIR_ITEM_TYPE[dir] ?? '')
    walkMd(abs, (file) => {
      const text = fs.readFileSync(file, 'utf8')
      const rel = path.relative(manifestDir, file)
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        if (RISKY_INSTALL_PATTERNS.some((re) => re.test(line)))
          failures.push(`${rel}:${i + 1}: risky install pattern`)
        if (checkNonTsxNpx && ANY_NPX_PATTERN.test(line) && !ALLOWED_NPX_PATTERN.test(line)) {
          failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx allowed)`)
        }
      }
      if (!rel.includes('/references/')) failures.push(...auditForbiddenTagsInText(text, rel))
    })
  }
  return failures
}

export function validateCatalogData(
  manifestDir: string,
  manifestVersion: unknown,
  items: CatalogItem[],
): ValidateCatalogResult {
  const failures = [
    ...auditManifestStructure(manifestVersion, items),
    ...auditForbiddenStacks(items),
    ...auditShippedFiles(manifestDir, items),
    ...auditMarkdownContent(manifestDir),
    ...auditDisallowedTags(items),
  ]
  return { ok: failures.length === 0, failures, items }
}
