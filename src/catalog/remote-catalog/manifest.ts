/** Fetches and schema-validates the remote catalog manifest. */
import type { CatalogItem } from '../../types.js'
import { warn } from '../../utils/logger.js'
import { parseManifest } from '../manifest-schema.js'

import { fetchText } from './http.js'
import { remoteBase } from './ref.js'

/** Downloads and schema-validates the remote manifest; returns null if fetch or validation fails. */
export async function fetchRemoteManifest(): Promise<{
  version: string
  items: CatalogItem[]
} | null> {
  const base = await remoteBase()
  const text = await fetchText(`${base}/manifest.json`)
  if (!text) return null
  const parsed = parseManifest(text)
  if (!parsed.ok) {
    warn(`Remote manifest failed schema validation: ${parsed.error}`)
    return null
  }
  if (!parsed.manifest.items.length) return null
  return parsed.manifest
}
