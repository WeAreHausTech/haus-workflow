import path from 'node:path'

/** Guards against path traversal: rejects absolute paths, backslashes, and `..` segments. */
export function isSafeCatalogPath(itemPath: string): boolean {
  if (!itemPath || path.isAbsolute(itemPath) || itemPath.includes('\\')) return false
  const normalized = path.normalize(itemPath)
  return !normalized.startsWith('..') && !normalized.includes('/..')
}

/** Guards relative file paths from tree listings (untrusted) before joining under a dest dir. */
export function isSafeRelativeFilePath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('//')) return false
  if (path.isAbsolute(rel)) return false
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'))
  return normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../')
}

/** Resolves itemPath under base; returns null if the result escapes the base directory. */
export function safeJoin(base: string, itemPath: string): string | null {
  if (!isSafeCatalogPath(itemPath)) return null
  const resolved = path.resolve(base, itemPath)
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null
}
