/** Shared types for the update subsystem, including UpdateDiff and related structures. */

/**
 * Normalised shape of a lockfile entry used by update diffing and reporting utilities.
 * This is the stable external contract; internal lockfile I/O uses `LockItem` from lockfile.ts.
 */
export type LockfileItem = {
  id: string
  type: string
  source: string
  version: string
  /** sha256 hash of the installed file content at the time of the last update. */
  hash: string
  installMode: string
  paths: string[]
}
