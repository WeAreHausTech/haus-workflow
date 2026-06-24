/** Path glob and regex matching for decision gate triggers. */

function segmentToRegex(segment: string): string {
  if (segment === '**') return '.*'
  return segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
}

function globToRegExp(pattern: string): RegExp {
  const pat = pattern.replace(/\\/g, '/')
  if (pat.startsWith('**/') && pat.endsWith('/**')) {
    const middle = pat.slice(3, -3)
    const midRe = middle.split('/').map(segmentToRegex).join('/')
    return new RegExp(`(^|/)${midRe}(/|$)`)
  }
  if (pat.startsWith('**/')) {
    const rest = pat.slice(3).split('/').map(segmentToRegex).join('/')
    return new RegExp(`^(?:.*/)?${rest}$`)
  }
  const reSource = pat.split('/').map(segmentToRegex).join('/')
  return new RegExp(`^${reSource}$`)
}

/** Returns true when `filePath` matches a glob pattern (posix-style). */
export function matchesPathGlob(filePath: string, pattern: string): boolean {
  const norm = filePath.replace(/\\/g, '/')
  return globToRegExp(pattern).test(norm)
}

export function matchesAnyGlob(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesPathGlob(filePath, p))
}

export function matchesAnyRegex(filePath: string, patterns: readonly string[]): boolean {
  const norm = filePath.replace(/\\/g, '/')
  return patterns.some((p) => new RegExp(p).test(norm))
}
