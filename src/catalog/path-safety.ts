import path from 'node:path'

/** Guards against path traversal: rejects absolute paths, backslashes, and `..` segments. */
export function isSafeCatalogPath(itemPath: string): boolean {
  if (!itemPath || path.isAbsolute(itemPath) || itemPath.includes('\\')) return false
  const normalized = path.normalize(itemPath)
  return !normalized.startsWith('..') && !normalized.includes('/..')
}
