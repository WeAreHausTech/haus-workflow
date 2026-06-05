/**
 * Loads catalog items from the local cache, project-local vendor copy, or bundled snapshot.
 * Test scenarios can override the source path via HAUS_FIXTURE_CATALOG env var.
 */

import path from 'node:path'

import type { CatalogItem } from '../types.js'
import { readJson } from '../utils/fs.js'
import { packageRoot } from '../utils/paths.js'

import { getCacheDir } from './remote-catalog.js'

export type CatalogSource = 'fixture' | 'cache' | 'local' | 'bundled'

/** Active catalog manifest plus the directory where item.path content resolves. */
export type CatalogManifestContext = {
  items: CatalogItem[]
  /** Base directory: item.path is relative to this (cache dir, fixture dir, or library/catalog). */
  contentRoot: string
  source: CatalogSource
}

/**
 * Returns the first non-empty catalog manifest and its content root so recommend and
 * apply resolve the same item metadata and on-disk paths (no cache/bundled split-brain).
 */
export async function loadCatalogContext(root: string): Promise<CatalogManifestContext> {
  const envPath = process.env['HAUS_FIXTURE_CATALOG']
  if (envPath) {
    const data = await readJson<{ items: CatalogItem[] }>(envPath)
    return {
      items: data?.items ?? [],
      contentRoot: path.dirname(envPath),
      source: 'fixture',
    }
  }

  const cacheDir = getCacheDir()
  const cacheManifestPath = path.join(cacheDir, 'manifest.json')
  const cacheData = await readJson<{ items: CatalogItem[] }>(cacheManifestPath)
  if (cacheData?.items?.length) {
    return { items: cacheData.items, contentRoot: cacheDir, source: 'cache' }
  }

  const localManifest = path.join(root, 'library/catalog/manifest.json')
  const localData = await readJson<{ items: CatalogItem[] }>(localManifest)
  if (localData?.items?.length) {
    return {
      items: localData.items,
      contentRoot: path.dirname(localManifest),
      source: 'local',
    }
  }

  const packageManifest = path.join(packageRoot(), 'library/catalog/manifest.json')
  const data = await readJson<{ items: CatalogItem[] }>(packageManifest)
  return {
    items: data?.items ?? [],
    contentRoot: path.dirname(packageManifest),
    source: 'bundled',
  }
}

/**
 * Returns catalog items using the first non-empty source found:
 * HAUS_FIXTURE_CATALOG env var → user cache → project-local vendor copy → bundled package snapshot.
 */
export async function loadCatalog(root: string): Promise<CatalogItem[]> {
  const ctx = await loadCatalogContext(root)
  return ctx.items
}

/** Absolute path to an item's cached/bundled content (skill dir or agent/template file). */
export function catalogItemContentPath(contentRoot: string, item: { path: string }): string {
  return path.join(contentRoot, item.path)
}
