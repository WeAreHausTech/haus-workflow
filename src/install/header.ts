/**
 * Builds and parses the `<!-- HAUS-MANAGED ... -->` stamp written at the top of
 * every haus-managed Markdown file, used to detect ownership and track versions.
 */

/** Parsed fields extracted from a haus-managed file header comment. */
export interface HausHeader {
  stableId: string
  schemaVersion: string
  source: string
}

const MD_PREFIX = '<!-- HAUS-MANAGED'
const MD_SUFFIX = ' -->'
/** YAML frontmatter fence. A file that opens with this on line 1 is a skill/agent. */
const FM_FENCE = '---'
/** Frontmatter field carrying the ownership marker for files that use frontmatter. */
const FM_KEY = 'haus_managed'

/** Parses the key=value attributes from the raw content of a HAUS-MANAGED marker. */
function parseAttrs(raw: string): HausHeader | undefined {
  const idMatch = /\bid=(\S+)/.exec(raw)
  const vMatch = /\bv=(\S+)/.exec(raw)
  const srcMatch = /\bsource=(\S+)/.exec(raw)
  if (!idMatch || !vMatch || !srcMatch) return undefined
  return { stableId: idMatch[1], schemaVersion: vMatch[1], source: srcMatch[1] }
}

/** True when `line` is a frontmatter fence, tolerating a trailing CR (CRLF files). */
function isFence(line: string | undefined): boolean {
  return (line ?? '').replace(/\r$/, '') === FM_FENCE
}

/** True when `content` opens with a YAML frontmatter fence on line 1. */
function hasFrontmatter(content: string): boolean {
  return isFence(content.split('\n', 1)[0])
}

/**
 * Returns the marker value from the `haus_managed:` field inside a leading frontmatter
 * block, or undefined if the file has no frontmatter / no such field.
 */
function frontmatterMarkerValue(content: string): string | undefined {
  const lines = content.split('\n')
  if (!isFence(lines[0])) return undefined
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i])) return undefined // closing fence reached, no marker
    const m = /^haus_managed:\s*"?(.*?)"?\s*$/.exec(lines[i])
    if (m) return m[1]
  }
  return undefined
}

/**
 * Parses the haus header from `content`, recognising both forms (ADR-0006):
 * a top-line `<!-- HAUS-MANAGED ... -->` comment, or a `haus_managed:` frontmatter field.
 */
export function parseMarkdownHeader(content: string): HausHeader | undefined {
  const firstLine = content.split('\n')[0] ?? ''
  if (firstLine.startsWith(MD_PREFIX)) return parseAttrs(firstLine)
  const fmValue = frontmatterMarkerValue(content)
  if (fmValue !== undefined) return parseAttrs(fmValue)
  return undefined
}

/** Serialises a HausHeader into a `<!-- HAUS-MANAGED ... -->` comment string. */
export function buildMarkdownHeader(h: HausHeader): string {
  return `${MD_PREFIX} id=${h.stableId} v=${h.schemaVersion} source=${h.source}${MD_SUFFIX}`
}

/** Serialises a HausHeader into the `id=.. v=.. source=..` value used in the frontmatter field. */
function buildMarkerValue(h: HausHeader): string {
  return `id=${h.stableId} v=${h.schemaVersion} source=${h.source}`
}

/**
 * Inserts/replaces the `haus_managed:` field as the last field of a leading frontmatter
 * block, keeping `---` on line 1. Idempotent: any existing field is stripped first.
 */
function stampFrontmatter(content: string, h: HausHeader): string {
  const lines = content.split('\n')
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i])) {
      close = i
      break
    }
  }
  // No closing fence: leave content untouched rather than corrupt a malformed file.
  if (close === -1) return content

  const fields: string[] = []
  for (let i = 1; i < close; i++) {
    if (/^haus_managed:/.test(lines[i])) continue // drop stale marker
    fields.push(lines[i])
  }
  const rebuilt = [
    FM_FENCE,
    ...fields,
    `${FM_KEY}: "${buildMarkerValue(h)}"`,
    ...lines.slice(close), // closing fence + body
  ]
  return rebuilt.join('\n')
}

/**
 * Stamps the haus ownership marker onto `content`, preserving the rest of the file.
 * Files with leading frontmatter get the marker as a field inside the block (keeps `---`
 * on line 1); plain docs get a top-line HTML comment. See ADR-0006.
 */
export function stampMarkdown(content: string, h: HausHeader): string {
  if (hasFrontmatter(content)) return stampFrontmatter(content, h)

  const header = buildMarkdownHeader(h)
  const firstLine = content.split('\n')[0] ?? ''
  if (firstLine.startsWith(MD_PREFIX)) {
    // Replace the existing header line. When the file is a bare header with no
    // trailing newline, indexOf returns -1 — drop the body entirely rather than
    // re-appending the whole string (which would duplicate the header).
    const nl = content.indexOf('\n')
    const rest = nl === -1 ? '' : content.slice(nl + 1)
    return rest === '' ? header : `${header}\n${rest}`
  }
  return `${header}\n${content}`
}

/** Returns true when `content` begins with a valid haus-managed header. */
export function hasHausHeader(content: string): boolean {
  return parseMarkdownHeader(content) !== undefined
}
