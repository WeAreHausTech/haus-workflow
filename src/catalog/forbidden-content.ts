/**
 * Scans markdown/catalog text for forbidden stack tokens (shared by CLI + catalog validators).
 */
import { FORBIDDEN_TAGS } from './validation-rules.js'

/** Tags omitted from prose scans — too many English false positives; still checked on manifest tags. */
const PROSE_FORBIDDEN_TAGS = FORBIDDEN_TAGS.filter((t) => t.toLowerCase() !== 'go')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Only the "## Use when" section can recommend stacks — other sections may name platforms in negation or paths. */
function extractUseWhenSection(text: string): string {
  const marker = '## Use when'
  const idx = text.toLowerCase().indexOf(marker.toLowerCase())
  if (idx < 0) return ''
  const tail = text.slice(idx + marker.length)
  const next = tail.search(/\n##\s+/)
  return next < 0 ? tail : tail.slice(0, next)
}

/** Extracts the YAML frontmatter `description:` value (the superpowers when-signal). */
export function extractFrontmatterDescription(text: string): string {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return ''
  const dm = m[1]!.match(/^description:[ \t]*(.*)$/m)
  if (!dm) return ''
  return dm[1]!.replace(/^["']|["']$/g, '').trim()
}

/**
 * Returns failure messages when the skill's when-signal recommends a forbidden stack.
 * Scans both the frontmatter `description:` (superpowers convention) and any legacy
 * `## Use when` section (haus-owned agents/skills); other prose may name platforms in
 * negation or file paths, so it is intentionally excluded.
 */
export function auditForbiddenTagsInText(text: string, label: string): string[] {
  const body = `${extractFrontmatterDescription(text)}\n${extractUseWhenSection(text)}`
  if (!body.trim()) return []

  const failures: string[] = []
  for (const word of PROSE_FORBIDDEN_TAGS) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
    if (re.test(body)) failures.push(`${label}: forbidden stack/tag "${word}" in content`)
  }
  return failures
}
