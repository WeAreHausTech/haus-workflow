export interface HausHeader {
  stableId: string;
  schemaVersion: string;
  source: string;
}

const MD_PREFIX = "<!-- HAUS-MANAGED";
const MD_SUFFIX = " -->";

function parseAttrs(raw: string): HausHeader | undefined {
  const idMatch = /\bid=(\S+)/.exec(raw);
  const vMatch = /\bv=(\S+)/.exec(raw);
  const srcMatch = /\bsource=(\S+)/.exec(raw);
  if (!idMatch || !vMatch || !srcMatch) return undefined;
  return { stableId: idMatch[1], schemaVersion: vMatch[1], source: srcMatch[1] };
}

export function parseMarkdownHeader(content: string): HausHeader | undefined {
  const firstLine = content.split("\n")[0] ?? "";
  if (!firstLine.startsWith(MD_PREFIX)) return undefined;
  return parseAttrs(firstLine);
}

export function buildMarkdownHeader(h: HausHeader): string {
  return `${MD_PREFIX} id=${h.stableId} v=${h.schemaVersion} source=${h.source}${MD_SUFFIX}`;
}

export function stampMarkdown(content: string, h: HausHeader): string {
  const header = buildMarkdownHeader(h);
  const existing = parseMarkdownHeader(content);
  if (existing) {
    const rest = content.slice(content.indexOf("\n") + 1);
    return `${header}\n${rest}`;
  }
  return `${header}\n${content}`;
}

export function hasHausHeader(content: string): boolean {
  return parseMarkdownHeader(content) !== undefined;
}
