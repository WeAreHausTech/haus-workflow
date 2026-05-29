/**
 * Builds and parses the `<!-- HAUS-MANAGED ... -->` stamp written at the top of
 * every haus-managed Markdown file, used to detect ownership and track versions.
 */

/** Parsed fields extracted from a haus-managed file header comment. */
export interface HausHeader {
  stableId: string;
  schemaVersion: string;
  source: string;
}

const MD_PREFIX = "<!-- HAUS-MANAGED";
const MD_SUFFIX = " -->";

/** Parses the key=value attributes from the raw content of a HAUS-MANAGED comment. */
function parseAttrs(raw: string): HausHeader | undefined {
  const idMatch = /\bid=(\S+)/.exec(raw);
  const vMatch = /\bv=(\S+)/.exec(raw);
  const srcMatch = /\bsource=(\S+)/.exec(raw);
  if (!idMatch || !vMatch || !srcMatch) return undefined;
  return { stableId: idMatch[1], schemaVersion: vMatch[1], source: srcMatch[1] };
}

/** Parses the haus header from the first line of `content`; returns undefined if absent. */
export function parseMarkdownHeader(content: string): HausHeader | undefined {
  const firstLine = content.split("\n")[0] ?? "";
  if (!firstLine.startsWith(MD_PREFIX)) return undefined;
  return parseAttrs(firstLine);
}

/** Serialises a HausHeader into a `<!-- HAUS-MANAGED ... -->` comment string. */
export function buildMarkdownHeader(h: HausHeader): string {
  return `${MD_PREFIX} id=${h.stableId} v=${h.schemaVersion} source=${h.source}${MD_SUFFIX}`;
}

/**
 * Prepends (or replaces) the haus header on `content`, preserving the rest of the file.
 */
export function stampMarkdown(content: string, h: HausHeader): string {
  const header = buildMarkdownHeader(h);
  const existing = parseMarkdownHeader(content);
  if (existing) {
    const rest = content.slice(content.indexOf("\n") + 1);
    return `${header}\n${rest}`;
  }
  return `${header}\n${content}`;
}

/** Returns true when `content` begins with a valid haus-managed header. */
export function hasHausHeader(content: string): boolean {
  return parseMarkdownHeader(content) !== undefined;
}
