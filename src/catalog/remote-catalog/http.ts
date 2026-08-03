/** Guarded HTTP fetch helpers shared by every catalog content fetcher. */
import path from 'node:path'

import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'

/** Fetches a URL and hands the response to `extract`; returns null on any network, HTTP, or extraction error. Timeout: 10 s. */
async function fetchGuarded<T>(
  url: string,
  extract: (res: Response) => Promise<T>,
): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      warn(`Catalog fetch HTTP ${res.status}: ${url}`)
      return null
    }
    return await extract(res)
  } catch (e) {
    warn(`Catalog fetch failed (${e instanceof Error ? e.constructor.name : String(e)}): ${url}`)
    return null
  }
}

/** Fetches raw text from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
export async function fetchText(url: string): Promise<string | null> {
  return fetchGuarded(url, (res) => res.text())
}

/** Fetches raw bytes from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
export async function fetchBytes(url: string): Promise<Buffer | null> {
  return fetchGuarded(url, async (res) => Buffer.from(await res.arrayBuffer()))
}

export type WriteOutcome = 'created' | 'updated' | 'unchanged'

/** Writes `text` to `dest` when missing or content differs; creates parent dirs on write. */
export async function writeTextIfChanged(dest: string, text: string): Promise<WriteOutcome> {
  if (await fs.pathExists(dest)) {
    const local = await fs.readFile(dest, 'utf8')
    if (local === text) return 'unchanged'
    await fs.writeFile(dest, text, 'utf8')
    return 'updated'
  }
  await fs.ensureDir(path.dirname(dest))
  await fs.writeFile(dest, text, 'utf8')
  return 'created'
}
