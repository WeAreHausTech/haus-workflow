/**
 * Reads and writes ~/.claude/haus/install-manifest.json, which tracks every file
 * haus has installed and the hook IDs it registered.
 */
import os from 'node:os'
import path from 'node:path'

import { readJson, writeJson } from '../utils/fs.js'

/** JSON schema discriminator for the install manifest format. */
export const MANIFEST_SCHEMA = 'haus-install-manifest/1'

/** Record for a single file haus has installed. */
export interface ManifestFile {
  /** Stable identifier matching the file header (e.g. "skill.caveman"). */
  stableId: string
  /** Absolute path where the file was written. */
  destPath: string
  /** Package-relative source path used to re-read the bundled content. */
  srcRelPath: string
  /** sha256 hash of the stamped file content at install time. */
  hash: string
  schemaVersion: string
}

/** Top-level structure of ~/.claude/haus/install-manifest.json. */
export interface InstallManifest {
  _schema: typeof MANIFEST_SCHEMA
  /** "name@version" string of the package that performed the install. */
  source: string
  installedAt: string
  files: ManifestFile[]
  /** Hook IDs registered into settings.json during this install. */
  hooks: string[]
}

/** Returns the absolute path to the user-global ~/.claude directory. */
export function globalClaudeDir(): string {
  return path.join(os.homedir(), '.claude')
}

/** Returns the absolute path to the install manifest JSON file. */
export function hausManifestPath(): string {
  return path.join(globalClaudeDir(), 'haus', 'install-manifest.json')
}

/** Reads the install manifest, returning undefined if not present or unreadable. */
export async function readManifest(): Promise<InstallManifest | undefined> {
  return readJson<InstallManifest>(hausManifestPath())
}

/** Writes the install manifest to disk, creating parent directories as needed. */
export async function writeManifest(manifest: InstallManifest): Promise<void> {
  await writeJson(hausManifestPath(), manifest)
}

/** Constructs a fresh InstallManifest object without writing it to disk. */
export function buildManifest(
  source: string,
  files: ManifestFile[],
  hooks: string[],
): InstallManifest {
  return {
    _schema: MANIFEST_SCHEMA,
    source,
    installedAt: new Date().toISOString(),
    files,
    hooks,
  }
}
