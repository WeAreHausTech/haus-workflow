/** Runtime schema validation for fetched catalog manifests (untrusted input). */

import type { CatalogItem } from '../types.js'

import { validateCuratedProvenance, validateReferences } from './manifest-item-fields.js'

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

const REQUIRES_ANY_KEYS = ['stack', 'dependency', 'packageNamePattern', 'role'] as const

function isRequiresAnyClause(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as Record<string, unknown>)
  if (keys.length !== 1) return false
  const key = keys[0]
  if (!REQUIRES_ANY_KEYS.includes(key as (typeof REQUIRES_ANY_KEYS)[number])) return false
  return typeof (value as Record<string, unknown>)[key!] === 'string'
}

function isRequiresAnyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.every(isRequiresAnyClause)
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
    const provenanceError = validateCuratedProvenance(item)
    if (provenanceError) return { ok: false, error: provenanceError }
    const referencesError = validateReferences(String(item.id), item.references)
    if (referencesError) return { ok: false, error: referencesError }
    if (!isStringArray(item.tags)) {
      return { ok: false, error: `${item.id}: tags must be a string array` }
    }
    if (!isStringArray(item.repoRoles)) {
      return { ok: false, error: `${item.id}: repoRoles must be a string array` }
    }
    if (item.requiresAny !== undefined && !isRequiresAnyArray(item.requiresAny)) {
      return { ok: false, error: `${item.id}: requiresAny must be an array of clause objects` }
    }
    if (typeof item.tokenEstimate !== 'number' || !Number.isFinite(item.tokenEstimate)) {
      return { ok: false, error: `${item.id}: tokenEstimate must be a finite number` }
    }
    items.push(raw as CatalogItem)
  }

  return { ok: true, manifest: { version: root.version, items } }
}
