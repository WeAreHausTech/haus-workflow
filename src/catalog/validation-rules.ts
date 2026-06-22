/**
 * Catalog validation rules — thin loader over the canonical `validation-rules.json`.
 *
 * SINGLE SOURCE OF TRUTH: all rule data lives in `library/catalog/validation-rules.json`,
 * a fixture synced from haus-workflow-catalog (the same mechanism as `manifest.json`;
 * see ADR-0001). This module only reconstructs regex objects from their `{ source, flags }`
 * form and re-exports the data under stable names. The catalog repo's
 * `scripts/validation-rules.mjs` loads the identical JSON, so the two validators
 * can no longer drift.
 *
 * Do NOT hand-edit rule values here — they come from the synced JSON.
 */

// Static JSON import: esbuild inlines this into the bundle at build time, so the
// rules travel with the CLI version that enforces them (validation is release-coupled,
// not runtime-fetched like the catalog content itself).
import rules from '../../library/catalog/validation-rules.json' with { type: 'json' }
import type { CatalogItem } from '../types.js'

interface RegexSpec {
  source: string
  flags: string
}

const toRegExp = (r: RegexSpec): RegExp => new RegExp(r.source, r.flags)

/** Tags that identify unsupported stacks. Items using these tags fail validation. */
export const FORBIDDEN_TAGS: readonly string[] = rules.forbiddenTags

/** Frontmatter keys required in skill SKILL.md, agent .md, and command .md (e.g. `description`). */
export const REQUIRED_SKILL_FRONTMATTER: readonly string[] = rules.requiredSkillFrontmatter

/** Install patterns that must not appear in shipped markdown. */
export const RISKY_INSTALL_PATTERNS: readonly RegExp[] = rules.riskyInstallPatterns.map(toRegExp)

/** The only npx invocation allowed in shipped markdown. */
export const ALLOWED_NPX_PATTERN: RegExp = toRegExp(rules.allowedNpxPattern)

/** Regex to detect any npx call (used to catch disallowed ones after allowing tsx). */
export const ANY_NPX_PATTERN: RegExp = toRegExp(rules.anyNpxPattern)

/**
 * Manifest `source` values exempt from the non-`tsx` npx ban (verbatim curated content).
 * Risky-install patterns stay enforced. See ADR-0005.
 */
export const NPX_TSX_ONLY_EXEMPT_SOURCES: readonly string[] = rules.npxTsxOnlyExemptSources ?? []

/** Whether the non-`tsx` npx ban applies to this item (source-scoped per ADR-0005). */
export function isNpxTsxOnlyExempt(_itemType: string, itemSource?: string): boolean {
  return Boolean(itemSource && NPX_TSX_ONLY_EXEMPT_SOURCES.includes(itemSource))
}

/** Map manifest item.path → source for repo-wide markdown walks. */
export function buildItemPathSourceMap(items: CatalogItem[]): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>()
  for (const item of items) {
    if (!item.path) continue
    map.set(String(item.path).replace(/\\/g, '/'), item.source)
  }
  return map
}

/** Longest manifest path prefix matching a shipped markdown file. */
export function resolveMarkdownItemSource(
  relPath: string,
  pathSourceMap: Map<string, string | undefined>,
): string | undefined {
  const norm = relPath.replace(/\\/g, '/')
  let bestPrefix = ''
  let source: string | undefined
  for (const [prefix, src] of pathSourceMap) {
    if ((norm === prefix || norm.startsWith(`${prefix}/`)) && prefix.length > bestPrefix.length) {
      bestPrefix = prefix
      source = src
    }
  }
  return source
}

/** Insecure URL pattern. All references must use https://. */
export const HTTP_URL_PATTERN: RegExp = toRegExp(rules.httpUrlPattern)

/** Markers that must not appear in shipped content. */
export const PLACEHOLDER_PATTERN: RegExp = toRegExp(rules.placeholderPattern)

/**
 * Allowlisted tokens — stack/role names plus catalog category tokens
 * (e.g. "haus", "security", "quality", "review"). A tag outside this set and the
 * specials below (`ALWAYS_ALLOWED_TAGS`, `PATTERN_TAG_SUFFIXES`) fails validation.
 */
export const ALLOWED_STACKS: readonly string[] = rules.allowedStacks

/** Category/meta tags always permitted regardless of the stack allowlist. */
export const ALWAYS_ALLOWED_TAGS: readonly string[] = rules.alwaysAllowedTags

/** Tag suffixes treated as conventions, not stack names (e.g. "react-patterns"). */
export const PATTERN_TAG_SUFFIXES: readonly string[] = rules.patternTagSuffixes

const ALLOWED_SET = new Set([...ALLOWED_STACKS, ...ALWAYS_ALLOWED_TAGS].map((t) => t.toLowerCase()))

/**
 * Returns true when a tag is permitted: it is in the stack allowlist, an always-allowed
 * meta tag, or ends with a pattern suffix. Mirrors the catalog's `isTagAllowed`.
 */
export function isTagAllowed(tag: string): boolean {
  const lower = tag.toLowerCase()
  if (ALLOWED_SET.has(lower)) return true
  return PATTERN_TAG_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

/** Returns a failure message per item tag that is not allowlisted (empty array = all valid). */
export function auditDisallowedTags(items: CatalogItem[]): string[] {
  const failures: string[] = []
  for (const item of items) {
    // Items missing an id are reported by structure validation; skipping them here
    // keeps tag-failure output actionable (no "undefined: tag not in allowlist").
    if (!item.id) continue
    for (const tag of Array.isArray(item.tags) ? item.tags : []) {
      if (!isTagAllowed(tag)) failures.push(`${item.id}: tag not in allowlist: "${tag}"`)
    }
  }
  return failures
}
