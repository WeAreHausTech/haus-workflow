/** Cache metadata for fetched llms.txt references. */
import path from 'node:path'

import fs from 'fs-extra'

export type RefEntry = {
  url: string
  etag?: string
  lastModified?: string
  fetchedAt: string
  file: string
}

export type RefsCacheMeta = Record<string, RefEntry>

const META_FILENAME = 'cache-meta.json'

export async function readCacheMeta(cacheDir: string): Promise<RefsCacheMeta> {
  const metaPath = path.join(cacheDir, META_FILENAME)
  try {
    const raw = await fs.readFile(metaPath, 'utf8')
    return JSON.parse(raw) as RefsCacheMeta
  } catch {
    return {}
  }
}

export async function writeCacheMeta(cacheDir: string, meta: RefsCacheMeta): Promise<void> {
  await fs.ensureDir(cacheDir)
  const metaPath = path.join(cacheDir, META_FILENAME)
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8')
}
