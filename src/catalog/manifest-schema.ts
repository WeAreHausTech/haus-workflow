/** Runtime schema validation for fetched catalog manifests (untrusted input). */

import type { CatalogItem } from '../types.js'

const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export type ParsedManifest = {
  version: string
  items: CatalogItem[]
}

export type ParseManifestResult =
  | { ok: true; manifest: ParsedManifest }
  | { ok: false; error: string }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function safeParse(json: string): unknown {
  return JSON.parse(json, (key, value) => {
    if (POLLUTION_KEYS.has(key)) return undefined
    return value
  })
}

/** Parse and validate manifest JSON from an untrusted remote source. */
export function parseManifest(json: string): ParseManifestResult {
  let data: unknown
  try {
    data = safeParse(json)
  } catch {
    return { ok: false, error: 'invalid JSON' }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'manifest must be an object' }
  }
  const root = data as Record<string, unknown>
  if (!isNonEmptyString(root.version)) {
    return { ok: false, error: 'missing version' }
  }
  if (!Array.isArray(root.items)) {
    return { ok: false, error: 'missing items array' }
  }

  const items: CatalogItem[] = []
  const seenIds = new Set<string>()
  const seenPaths = new Set<string>()
  for (let i = 0; i < root.items.length; i++) {
    const raw = root.items[i]
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `item[${i}]: invalid entry` }
    }
    const item = raw as Record<string, unknown>
    if (!isNonEmptyString(item.id)) {
      return { ok: false, error: `item[${i}]: missing id` }
    }
    if (!isNonEmptyString(item.type)) {
      return { ok: false, error: `${item.id}: missing type` }
    }
    if (!isNonEmptyString(item.path)) {
      return { ok: false, error: `${item.id}: missing path` }
    }
    if (seenIds.has(item.id)) {
      return { ok: false, error: `${item.id}: duplicate id` }
    }
    seenIds.add(item.id)
    const normPath = item.path.replace(/\\/g, '/')
    if (seenPaths.has(normPath)) {
      return { ok: false, error: `${item.id}: duplicate path "${normPath}"` }
    }
    seenPaths.add(normPath)
    if (item.source === 'curated') {
      if (!isNonEmptyString(item.reviewStatus)) {
        return { ok: false, error: `${item.id}: curated item missing reviewStatus` }
      }
      if (!isNonEmptyString(item.riskLevel)) {
        return { ok: false, error: `${item.id}: curated item missing riskLevel` }
      }
    }
    items.push(raw as CatalogItem)
  }

  return { ok: true, manifest: { version: root.version, items } }
}
