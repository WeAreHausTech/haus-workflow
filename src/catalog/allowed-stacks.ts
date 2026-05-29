/**
 * Reads the project-local allowed-stacks list from library/catalog/allowed-stacks.json.
 * Defines which stack/role tag combinations are valid for catalog items in this project.
 */

import path from 'node:path'

import { readJson } from '../utils/fs.js'

/**
 * Returns the list of permitted stack/role tags for the current project.
 * Returns an empty array if the file is absent (no restriction applied).
 * @param root - Absolute path to the project root.
 */
export async function readAllowedStacks(root: string): Promise<string[]> {
  const data = await readJson<{ stacks: string[] }>(
    path.join(root, 'library', 'catalog', 'allowed-stacks.json'),
  )
  return data?.stacks ?? []
}
