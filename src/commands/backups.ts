/**
 * `haus backups` — list, restore, and prune snapshots under `.haus-workflow/backups/`.
 *
 * Three unrelated call sites accumulate backups there today, with three different
 * naming schemes and nothing to manage them afterward:
 * - `haus.lock.<epoch-ms>.json` — flat lockfile snapshot (`applyLock`, src/update/lockfile.ts)
 * - `undo-<iso-stamp>/<relative-path>` — per-file snapshot before `haus undo` deletes
 * - `prune-<iso-stamp>/<relative-path>` — per-file snapshot before `apply --prune` deletes
 */
import path from 'node:path'

import fs from 'fs-extra'

import { error, log, warn } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'
import { confirm } from '../utils/prompts.js'

export type BackupKind = 'lock' | 'undo' | 'prune'

export type BackupEntry = {
  id: string
  kind: BackupKind
  absPath: string
  mtimeMs: number
}

const LOCK_BACKUP_RE = /^haus\.lock\.\d+\.json$/

function classify(name: string): BackupKind | undefined {
  if (LOCK_BACKUP_RE.test(name)) return 'lock'
  if (name.startsWith('undo-')) return 'undo'
  if (name.startsWith('prune-')) return 'prune'
  return undefined
}

/**
 * Enumerate recognized backup entries under `.haus-workflow/backups/`, oldest first.
 * Uses `lstat` (not `stat`) so a symlink at the top level is never followed, and
 * requires each entry to match the on-disk shape its naming scheme implies (lock
 * snapshots are files; undo/prune snapshots are directories) — a symlink or a
 * type-mismatched entry is excluded rather than treated as a valid backup, since
 * `restore` would otherwise dereference it despite the restore path's own
 * never-follow-symlinks rule (see ADR-0019).
 */
export async function listBackups(root: string): Promise<BackupEntry[]> {
  const dir = hausPath(root, 'backups')
  if (!(await fs.pathExists(dir))) return []
  const names = await fs.readdir(dir)
  const entries: BackupEntry[] = []
  for (const name of names) {
    const kind = classify(name)
    if (!kind) continue
    const absPath = path.join(dir, name)
    const stat = await fs.lstat(absPath)
    if (stat.isSymbolicLink()) continue
    const expectDirectory = kind !== 'lock'
    if (stat.isDirectory() !== expectDirectory) continue
    entries.push({ id: name, kind, absPath, mtimeMs: stat.mtimeMs })
  }
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs)
  return entries
}

function formatAge(mtimeMs: number, now: number): string {
  const minutes = Math.round(Math.max(0, now - mtimeMs) / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

async function runList(root: string): Promise<void> {
  const entries = await listBackups(root)
  if (entries.length === 0) {
    log('No backups found under .haus-workflow/backups/.')
    return
  }
  const now = Date.now()
  const newestFirst = [...entries].reverse()
  for (const entry of newestFirst) {
    log(`${entry.id}  [${entry.kind}]  ${formatAge(entry.mtimeMs, now)}`)
  }
}

/**
 * True when writing to `target` would go through a symlink — either `target` itself
 * already existing as a symlink or other non-regular file, or an ancestor directory
 * between it and `root` being a symlink (e.g. `.claude/` or `.haus-workflow/` swapped
 * for one). `fs.ensureDir`/`fs.copy` follow symlinks by design; without this check, a
 * symlink planted anywhere in the live project tree — not just inside a backup — could
 * redirect a restore's write outside the project root.
 *
 * Walks from `root` DOWN to `target`, one path segment at a time, checking each newly
 * added segment with `lstat` before extending further. This is deliberate: `lstat` only
 * ever declines to dereference the *final* component of the path it's given — every
 * component before that is resolved transparently by the OS, including through a
 * symlink. Checking `lstat(root/.claude/rules)` in one call would silently resolve a
 * symlinked `.claude` before ever inspecting it. Building the path incrementally from
 * an already-verified-safe prefix means each `lstat` call's only unverified component is
 * exactly the one segment being tested. Missing segments are safe (nothing exists yet
 * to follow); real errors other than "doesn't exist" propagate.
 */
async function isUnsafeWriteTarget(root: string, target: string): Promise<boolean> {
  const segments = path.relative(root, target).split(path.sep).filter(Boolean)
  let current = root
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i])
    const isLastSegment = i === segments.length - 1
    try {
      const stat = await fs.lstat(current)
      if (isLastSegment) {
        if (!stat.isFile()) return true
      } else if (!stat.isDirectory()) {
        return true
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }
  }
  return false
}

async function restoreLockBackup(root: string, entry: BackupEntry, yes: boolean): Promise<boolean> {
  const target = hausPath(root, 'haus.lock.json')
  if (await isUnsafeWriteTarget(root, target)) {
    error(
      `Refusing to restore: ${target} (or a parent directory) is a symlink or other non-regular file — never written through.`,
    )
    return false
  }
  if (await fs.pathExists(target)) {
    const targetStat = await fs.stat(target)
    if (targetStat.mtimeMs > entry.mtimeMs) {
      warn(
        `Current haus.lock.json (${new Date(targetStat.mtimeMs).toISOString()}) is newer than backup ${entry.id} (${new Date(entry.mtimeMs).toISOString()}) — it will be overwritten.`,
      )
    }
  }
  if (!yes) {
    const ok = await confirm(
      `Restore .haus-workflow/haus.lock.json from backup ${entry.id}? This overwrites the current lockfile.`,
    )
    if (!ok) {
      log('Cancelled.')
      return false
    }
  }
  await fs.copy(entry.absPath, target, { overwrite: true })
  log(`Restored .haus-workflow/haus.lock.json from ${entry.id}.`)
  return true
}

/**
 * Walks a backup directory for real files to restore, using `lstat` (not `stat`) so a
 * symlink is never followed — a symlink planted inside a backup dir (e.g. checked into
 * a branch, since `.haus-workflow/backups/` is not gitignored) could otherwise point
 * outside the project root and have its target's content copied into tracked files on
 * restore. Symlinks are skipped and reported, never dereferenced. Only regular files
 * (`isFile()`) are restored — a FIFO, socket, or device node landing in a backup dir
 * would otherwise be handed to `fs.copy`, which can fail or behave unexpectedly on
 * special files; those are skipped and reported too, alongside symlinks.
 */
async function collectFilesRecursive(
  dir: string,
): Promise<{ files: string[]; skippedLinks: string[]; skippedOther: string[] }> {
  const files: string[] = []
  const skippedLinks: string[] = []
  const skippedOther: string[] = []
  const names = await fs.readdir(dir)
  for (const name of names) {
    const abs = path.join(dir, name)
    const stat = await fs.lstat(abs)
    if (stat.isSymbolicLink()) {
      skippedLinks.push(abs)
      continue
    }
    if (stat.isDirectory()) {
      const nested = await collectFilesRecursive(abs)
      files.push(...nested.files)
      skippedLinks.push(...nested.skippedLinks)
      skippedOther.push(...nested.skippedOther)
    } else if (stat.isFile()) {
      files.push(abs)
    } else {
      skippedOther.push(abs)
    }
  }
  return { files, skippedLinks, skippedOther }
}

async function restoreDirBackup(root: string, entry: BackupEntry, yes: boolean): Promise<boolean> {
  const { files, skippedLinks, skippedOther } = await collectFilesRecursive(entry.absPath)
  if (skippedLinks.length > 0) {
    warn(
      `Skipped ${skippedLinks.length} symlink(s) inside backup ${entry.id} — never followed: ${skippedLinks.map((abs) => path.relative(entry.absPath, abs)).join(', ')}`,
    )
  }
  if (skippedOther.length > 0) {
    warn(
      `Skipped ${skippedOther.length} non-regular file(s) inside backup ${entry.id} (not restorable): ${skippedOther.map((abs) => path.relative(entry.absPath, abs)).join(', ')}`,
    )
  }
  if (files.length === 0) {
    log(`Backup ${entry.id} contains no files.`)
    return false
  }
  const safeFiles: string[] = []
  const unsafeTargets: string[] = []
  for (const abs of files) {
    const rel = path.relative(entry.absPath, abs)
    const target = path.join(root, rel)
    if (await isUnsafeWriteTarget(root, target)) unsafeTargets.push(rel)
    else safeFiles.push(abs)
  }
  if (unsafeTargets.length > 0) {
    warn(
      `Skipped ${unsafeTargets.length} restore target(s) that are a symlink (or under one) rather than a plain path — never written through: ${unsafeTargets.join(', ')}`,
    )
  }
  if (safeFiles.length === 0) {
    log(`Backup ${entry.id} has no restorable targets.`)
    return false
  }
  const stale: Array<{ rel: string; targetMtimeMs: number; backupMtimeMs: number }> = []
  for (const abs of safeFiles) {
    const rel = path.relative(entry.absPath, abs)
    const target = path.join(root, rel)
    if (await fs.pathExists(target)) {
      const [targetStat, backupFileStat] = await Promise.all([fs.stat(target), fs.stat(abs)])
      if (targetStat.mtimeMs > backupFileStat.mtimeMs) {
        stale.push({
          rel,
          targetMtimeMs: targetStat.mtimeMs,
          backupMtimeMs: backupFileStat.mtimeMs,
        })
      }
    }
  }
  if (stale.length > 0) {
    const detail = stale
      .map(
        (s) =>
          `${s.rel} (destination: ${new Date(s.targetMtimeMs).toISOString()}, backup: ${new Date(s.backupMtimeMs).toISOString()})`,
      )
      .join('; ')
    warn(
      `${stale.length} file(s) at the restore destination are newer than backup ${entry.id} and will be overwritten: ${detail}`,
    )
  }
  if (!yes) {
    const ok = await confirm(
      `Restore ${safeFiles.length} file(s) from backup ${entry.id} to their original paths?`,
    )
    if (!ok) {
      log('Cancelled.')
      return false
    }
  }
  for (const abs of safeFiles) {
    const rel = path.relative(entry.absPath, abs)
    const target = path.join(root, rel)
    await fs.ensureDir(path.dirname(target))
    await fs.copy(abs, target, { overwrite: true })
  }
  log(`Restored ${safeFiles.length} file(s) from ${entry.id}.`)
  return true
}

async function runRestore(root: string, id: string, yes: boolean): Promise<boolean> {
  const entries = await listBackups(root)
  const entry = entries.find((e) => e.id === id)
  if (!entry) {
    error(`No backup found with id "${id}". Run \`haus backups list\` to see available backups.`)
    return false
  }
  return entry.kind === 'lock'
    ? restoreLockBackup(root, entry, yes)
    : restoreDirBackup(root, entry, yes)
}

async function runPrune(
  root: string,
  opts: { olderThanDays?: number; keep?: number; yes?: boolean },
): Promise<boolean> {
  if (opts.olderThanDays === undefined && opts.keep === undefined) {
    error('Specify --older-than <days> or --keep <n> — refusing to prune with no bound.')
    return false
  }
  const entries = await listBackups(root)
  const now = Date.now()
  const toRemove = new Set<string>()
  if (opts.olderThanDays !== undefined) {
    const cutoff = now - opts.olderThanDays * 24 * 60 * 60 * 1000
    for (const entry of entries) if (entry.mtimeMs < cutoff) toRemove.add(entry.id)
  }
  if (opts.keep !== undefined) {
    const excess = entries.length - opts.keep
    if (excess > 0) for (const entry of entries.slice(0, excess)) toRemove.add(entry.id)
  }
  if (toRemove.size === 0) {
    log('Nothing to prune.')
    return true
  }
  const removeList = entries.filter((e) => toRemove.has(e.id))
  const keepCount = entries.length - removeList.length
  if (!opts.yes) {
    const ok = await confirm(
      `Remove ${removeList.length} backup(s)?\n  ${removeList.map((e) => e.id).join('\n  ')}\nKeeping ${keepCount}.`,
    )
    if (!ok) {
      log('Cancelled.')
      return false
    }
  }
  const removed: string[] = []
  const failed: Array<{ id: string; message: string }> = []
  for (const entry of removeList) {
    try {
      await fs.remove(entry.absPath)
      removed.push(entry.id)
    } catch (err) {
      failed.push({ id: entry.id, message: err instanceof Error ? err.message : String(err) })
    }
  }
  log(`Removed ${removed.length} backup(s), kept ${entries.length - removed.length}.`)
  if (failed.length > 0) {
    warn(
      `Failed to remove ${failed.length} backup(s): ${failed.map((f) => `${f.id} (${f.message})`).join(', ')}`,
    )
    return false
  }
  return true
}

export type BackupsOptions = {
  id?: string
  yes?: boolean
  olderThan?: string | number
  keep?: string | number
  root?: string
}

export async function runBackups(
  action: 'list' | 'restore' | 'prune',
  opts: BackupsOptions = {},
): Promise<void> {
  const root = opts.root ?? process.cwd()
  if (action === 'list') {
    await runList(root)
    return
  }
  if (action === 'restore') {
    if (!opts.id) {
      error('Usage: haus backups restore <id>')
      process.exitCode = 1
      return
    }
    if (!(await runRestore(root, opts.id, Boolean(opts.yes)))) process.exitCode = 1
    return
  }
  let olderThanDays: number | undefined
  if (opts.olderThan !== undefined) {
    const n = Number(opts.olderThan)
    if (!Number.isFinite(n) || n < 0) {
      error(
        `Invalid --older-than value "${opts.olderThan}" — expected a non-negative number of days.`,
      )
      process.exitCode = 1
      return
    }
    olderThanDays = n
  }
  let keep: number | undefined
  if (opts.keep !== undefined) {
    const n = Number(opts.keep)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      error(`Invalid --keep value "${opts.keep}" — expected a non-negative integer.`)
      process.exitCode = 1
      return
    }
    keep = n
  }
  if (!(await runPrune(root, { olderThanDays, keep, yes: Boolean(opts.yes) }))) process.exitCode = 1
}
