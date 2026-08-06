/**
 * Copy-on-write clone of hydration targets (`node_modules` etc.), per plan doc
 * Task 4. Real per-filesystem CoW support is detected before attempting a clone:
 *
 * - macOS/APFS: `cp -c -R` (clonefile).
 * - Linux btrfs/XFS: `cp -a --reflink=always -R` — `always`, not `auto`: a btrfs/
 *   xfs *filesystem type* match doesn't guarantee the specific mount actually has
 *   reflink enabled (e.g. xfs needs `-m reflink=1` at mkfs time), and `auto` would
 *   silently fall back to a full byte copy in that case with no indication it
 *   happened. `always` fails fast instead, so that case still correctly reports
 *   `ok: false` rather than eating a multi-hundred-MB copy silently.
 * - Anything else (ext4, unknown platform, or a real `--reflink=always` failure):
 *   skipped/failed entirely rather than falling back to a copy. Callers go
 *   straight to install-reconciliation instead.
 *
 * A copy failure is logged by the caller and never fatal to the overall hydrate/add
 * flow — worst case, that member falls through to a plain install.
 */
import path from 'node:path'

import fs from 'fs-extra'

import { runCommand } from '../../utils/exec.js'

export type CowStrategy = 'darwin-clonefile' | 'linux-reflink' | 'unsupported' | 'unknown-platform'

/** Extract the filesystem type macOS's `mount` reports for the volume backing `dir`. */
async function getMacFilesystemType(dir: string): Promise<string | undefined> {
  const df = await runCommand('df', ['-P', dir])
  if (df.exitCode !== 0) return undefined
  const lines = df.stdout.trim().split('\n')
  const dataLine = lines[lines.length - 1]
  const device = dataLine?.split(/\s+/)[0]
  if (!device) return undefined

  const mount = await runCommand('mount')
  if (mount.exitCode !== 0) return undefined
  const line = mount.stdout.split('\n').find((l) => l.startsWith(`${device} `))
  const match = line?.match(/\(([^,)]+)/)
  return match?.[1]?.trim()
}

/** `stat -f -c %T <dir>` — the Linux filesystem type name (e.g. `btrfs`, `ext2/ext3`). */
async function getLinuxFilesystemType(dir: string): Promise<string | undefined> {
  const result = await runCommand('stat', ['-f', '-c', '%T', dir])
  if (result.exitCode !== 0) return undefined
  return result.stdout.trim()
}

/** Detect whether the filesystem backing `dir` supports a genuine CoW clone. */
export async function detectCowStrategy(dir: string): Promise<CowStrategy> {
  if (process.platform === 'darwin') {
    const fsType = await getMacFilesystemType(dir)
    return fsType === 'apfs' ? 'darwin-clonefile' : 'unsupported'
  }
  if (process.platform === 'linux') {
    const fsType = await getLinuxFilesystemType(dir)
    return fsType === 'btrfs' || fsType === 'xfs' ? 'linux-reflink' : 'unsupported'
  }
  return 'unknown-platform'
}

export type CowCopyResult = {
  strategy: CowStrategy
  attempted: boolean
  ok: boolean
  error?: string
}

/**
 * Copy-on-write clone `src` -> `dest`. Never throws: a missing `src`, an
 * unsupported filesystem, or a failed `cp` invocation all return `ok: false`
 * with enough detail for the caller to log and move on to install-reconciliation.
 */
export async function cowCopyDir(src: string, dest: string): Promise<CowCopyResult> {
  const srcExists = await fs.pathExists(src)
  if (!srcExists)
    return { strategy: 'unsupported', attempted: false, ok: false, error: 'source missing' }

  const strategy = await detectCowStrategy(path.dirname(dest))
  if (strategy === 'unsupported' || strategy === 'unknown-platform') {
    return { strategy, attempted: false, ok: false }
  }

  await fs.ensureDir(path.dirname(dest))
  // `--reflink=always` (not `auto`): `auto` silently falls back to a full byte
  // copy when reflinks aren't actually usable (e.g. an xfs volume mounted
  // without reflink support, even though the filesystem *type* check above says
  // xfs) — exactly the "silent 310MB copy" this module's own doc says to avoid.
  // `always` fails fast instead, so a genuinely non-CoW-capable mount correctly
  // falls through to install-reconciliation via `ok: false`, not an expensive
  // copy neither of us asked for.
  const args =
    strategy === 'darwin-clonefile'
      ? ['-c', '-R', src, dest]
      : ['-a', '--reflink=always', src, dest]
  const result = await runCommand('cp', args)
  return {
    strategy,
    attempted: true,
    ok: result.exitCode === 0,
    error: result.exitCode === 0 ? undefined : result.stderr,
  }
}
