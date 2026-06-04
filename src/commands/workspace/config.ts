/**
 * Shared `haus.workspace.yaml` types + parser.
 *
 * One validated parser for every workspace consumer (discover / scan / setup /
 * doctor) so they can't drift apart. Parsing is defensive: malformed YAML and bad
 * shapes return `undefined`/empty rather than throwing, and individual repo entries
 * missing `name`/`path` are dropped so a single bad entry can't crash `path.resolve`.
 */
import path from 'node:path'

import YAML from 'yaml'

import { readText } from '../../utils/fs.js'

/** A single member repo entry in the workspace yaml. */
export type RepoEntry = { name: string; path: string; role?: string }

/** The parsed, validated workspace configuration. */
export type WorkspaceConfig = {
  client: string
  repos: RepoEntry[]
  relationships: unknown[]
}

/** The workspace manifest/config filename, resolved relative to the workspace root. */
export const WORKSPACE_FILE = 'haus.workspace.yaml'

/**
 * Parse + validate workspace yaml text.
 *
 * @returns the config, or `undefined` when `text` is missing/empty/malformed. A
 *   defined result always has a `repos` array (possibly empty) with every entry
 *   carrying a string `name` and `path`.
 */
export function parseWorkspaceConfig(text: string | undefined): WorkspaceConfig | undefined {
  if (!text) return undefined
  let parsed: unknown
  try {
    parsed = YAML.parse(text)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const obj = parsed as Partial<WorkspaceConfig>
  const repos = Array.isArray(obj.repos)
    ? (obj.repos as unknown[]).filter(
        (r): r is RepoEntry =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as RepoEntry).name === 'string' &&
          typeof (r as RepoEntry).path === 'string',
      )
    : []
  return {
    client: typeof obj.client === 'string' ? obj.client : 'unknown',
    repos,
    relationships: Array.isArray(obj.relationships) ? obj.relationships : [],
  }
}

/** Read + parse the workspace yaml at a workspace root (`undefined` if absent/malformed). */
export async function readWorkspaceConfig(
  workspaceRoot: string,
): Promise<WorkspaceConfig | undefined> {
  return parseWorkspaceConfig(await readText(path.join(workspaceRoot, WORKSPACE_FILE)))
}
