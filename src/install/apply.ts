/**
 * Applies bundled catalog items to ~/.claude/: copies skill/agent files, merges hook settings,
 * and writes the install manifest. Supports dry-run, force, and check modes.
 */
import crypto from 'node:crypto'
import path from 'node:path'

import fs from 'fs-extra'

import { buildAskRules } from '../security/ask-rules.js'
import { buildDenyRules } from '../security/deny-rules.js'
import { readText, writeText } from '../utils/fs.js'
import { log, warn } from '../utils/logger.js'
import { packageRoot } from '../utils/paths.js'

import { buildAllowRules } from './allow-rules.js'
import { parseMarkdownHeader, stampMarkdown } from './header.js'
import {
  buildManifest,
  globalClaudeDir,
  type ManifestFile,
  readManifest,
  writeManifest,
} from './manifest.js'
import {
  loadHooksFragment,
  mergeAllowRules,
  mergeAskRules,
  mergeDenyRules,
  mergeHooks,
  readSettings,
  writeSettings,
} from './settings-merge.js'

/** Manifest schema version written into each installed file header and manifest entry. */
const SCHEMA_VERSION = '1'

/** Options controlling how `applyInstall` behaves. */
export interface ApplyOptions {
  /** Simulate all changes without writing any files. */
  dryRun?: boolean
  /** Overwrite user-edited haus-managed files. */
  force?: boolean
  /** Only detect drift — no writes. */
  check?: boolean
}

/** Summary of files created, updated, skipped, or deleted during an install. */
export interface ApplyResult {
  created: string[]
  updated: string[]
  skipped: string[]
  /** Files skipped because they exist without a haus header — treated as user-created. */
  userOwned: string[]
  /** Files that were skipped because they have a haus header but the content differs from the manifest hash — meaning the user edited them. */
  userEdited: string[]
  deleted: string[]
  /** Hook IDs registered into settings.json during this run. */
  hookIds: string[]
  /** True when check mode detected hash drift between installed files and source. */
  drift: boolean
}

/** Returns a sha256 prefixed hash of the given string content. */
function hashContent(content: string): string {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`
}

/** Reads package.json to build a "name@version" source string for stamping installed files. */
function sourceVersion(): string {
  try {
    const pkgPath = path.join(packageRoot(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string }
    return `${pkg.name ?? 'haus'}@${pkg.version ?? '0.0.0'}`
  } catch {
    return 'haus@0.0.0'
  }
}

/** Absolute path to the bundled library/global directory inside this package. */
function globalSrcDir(): string {
  return path.join(packageRoot(), 'library', 'global')
}

/** Mapping from a bundled source file to its install destination. */
interface SourceFile {
  /** Stable identifier used in headers and the manifest (e.g. "skill.caveman"). */
  stableId: string
  srcRelPath: string
  destPath: string
}

/** Enumerates all skills and global slash commands under `srcDir` into SourceFile entries. */
function collectSourceFiles(srcDir: string, claudeDir: string): SourceFile[] {
  const entries: SourceFile[] = []

  const skillsDir = path.join(srcDir, 'skills')
  if (fs.pathExistsSync(skillsDir)) {
    for (const skillName of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skillName, 'SKILL.md')
      if (fs.pathExistsSync(skillFile)) {
        entries.push({
          stableId: `skill.${skillName}`,
          srcRelPath: path.join('library', 'global', 'skills', skillName, 'SKILL.md'),
          destPath: path.join(claudeDir, 'skills', skillName, 'SKILL.md'),
        })
      }
    }
  }

  // Global slash commands: flat `*.md` → ~/.claude/commands/<name>.md (CC discovers
  // commands flat; the command name is the filename). Seeded by install so haus is
  // discoverable in the `/` menu of every project, even before first setup (WS6).
  const commandsDir = path.join(srcDir, 'commands')
  if (fs.pathExistsSync(commandsDir)) {
    for (const fileName of fs.readdirSync(commandsDir)) {
      if (!fileName.endsWith('.md')) continue
      const commandName = fileName.slice(0, -'.md'.length)
      entries.push({
        stableId: `command.${commandName}`,
        srcRelPath: path.join('library', 'global', 'commands', fileName),
        destPath: path.join(claudeDir, 'commands', fileName),
      })
    }
  }

  return entries
}

/**
 * Core install routine: stamps and copies all bundled files to ~/.claude/,
 * merges hooks into settings.json, deletes orphaned files, and saves the manifest.
 */
export async function applyInstall(options: ApplyOptions = {}): Promise<ApplyResult> {
  const { dryRun = false, force = false, check = false } = options

  const claudeDir = globalClaudeDir()
  const srcDir = globalSrcDir()
  const source = sourceVersion()

  const existingManifest = await readManifest()
  const manifestByDest = new Map(existingManifest?.files.map((f) => [f.destPath, f]) ?? [])

  const sourceFiles = collectSourceFiles(srcDir, claudeDir)

  const result: ApplyResult = {
    created: [],
    updated: [],
    skipped: [],
    userOwned: [],
    userEdited: [],
    deleted: [],
    hookIds: [],
    drift: false,
  }

  const manifestFiles: ManifestFile[] = []

  for (const entry of sourceFiles) {
    const srcPath = path.join(packageRoot(), entry.srcRelPath)
    const rawContent = await readText(srcPath)
    if (rawContent === undefined) {
      warn(`Source file not found: ${entry.srcRelPath}`)
      continue
    }

    const stamped = stampMarkdown(rawContent, {
      stableId: entry.stableId,
      schemaVersion: SCHEMA_VERSION,
      source,
    })
    const newHash = hashContent(stamped)

    const existing = manifestByDest.get(entry.destPath)

    if (check) {
      if (existing && existing.hash !== newHash) {
        result.drift = true
        result.skipped.push(entry.destPath)
      }
      continue
    }

    const destExists = fs.pathExistsSync(entry.destPath)

    if (destExists) {
      const currentContent = await readText(entry.destPath)
      if (currentContent !== undefined) {
        const hasHeader = parseMarkdownHeader(currentContent) !== undefined
        if (!hasHeader) {
          warn(`Refusing to overwrite user-owned file: ${entry.destPath}`)
          result.skipped.push(entry.destPath)
          result.userOwned.push(entry.destPath)
          continue
        }
        if (existing && hashContent(currentContent) !== existing.hash && !force) {
          warn(`User edited haus file (skipping): ${entry.destPath} — use --force to overwrite`)
          result.skipped.push(entry.destPath)
          result.userEdited.push(entry.destPath)
          manifestFiles.push(existing)
          continue
        }
        if (existing && existing.hash === newHash && !force) {
          result.skipped.push(entry.destPath)
          manifestFiles.push({ ...existing, hash: newHash })
          continue
        }
        if (!dryRun) await writeText(entry.destPath, stamped)
        result.updated.push(entry.destPath)
      }
    } else {
      if (!dryRun) await writeText(entry.destPath, stamped)
      result.created.push(entry.destPath)
    }

    manifestFiles.push({
      stableId: entry.stableId,
      destPath: entry.destPath,
      srcRelPath: entry.srcRelPath,
      hash: newHash,
      schemaVersion: SCHEMA_VERSION,
    })
  }

  // Settings merge is a write-path concern: it only matters when we actually
  // persist settings.json below (not dryRun, not check). In check mode we must
  // NOT report hookIds — that is a read-only drift probe and claiming hooks were
  // "added" misrepresents it. Compute the merge lazily so check mode skips it.
  let mergedSettings: Awaited<ReturnType<typeof readSettings>> | undefined
  if (!check) {
    const fragmentPath = path.join(srcDir, 'settings-fragments', 'hooks.json')
    const fragments = await loadHooksFragment(fragmentPath)
    const settings = await readSettings()
    const { settings: hookSettings, addedIds } = mergeHooks(settings, fragments)
    // Write the deterministic NEVER rules into permissions.deny (WORKFLOW.md "enforce in both").
    const { settings: deniedSettings } = mergeDenyRules(hookSettings, buildDenyRules())
    // Pre-allow haus's own scoped subcommands so non-devs aren't prompted on every step (WS6).
    const { settings: allowedSettings } = mergeAllowRules(deniedSettings, buildAllowRules())
    // Write ask-tier rules into permissions.ask so Claude prompts before executing them.
    const merged = mergeAskRules(allowedSettings, buildAskRules())
    mergedSettings = merged.settings
    result.hookIds = addedIds
  }

  // Delete files that were in the old manifest but are no longer in the current package.
  if (!check && existingManifest) {
    const currentDestPaths = new Set(sourceFiles.map((f) => f.destPath))
    for (const entry of existingManifest.files) {
      if (currentDestPaths.has(entry.destPath)) continue
      if (!fs.pathExistsSync(entry.destPath)) continue
      const content = await readText(entry.destPath)
      if (!content) continue
      const hasHeader = parseMarkdownHeader(content) !== undefined
      const currentHash = hashContent(content)
      if (hasHeader && currentHash === entry.hash) {
        if (!dryRun) await fs.remove(entry.destPath)
        result.deleted.push(entry.destPath)
      } else {
        warn(`Orphaned file ${entry.destPath} was user-modified — leaving in place`)
        result.skipped.push(entry.destPath)
      }
    }
  }

  if (!dryRun && !check && mergedSettings) {
    await writeSettings(mergedSettings)
    const manifest = buildManifest(source, manifestFiles, [
      ...new Set([...(existingManifest?.hooks ?? []), ...result.hookIds]),
    ])
    await writeManifest(manifest)
  }

  return result
}

/** Prints a human-readable install summary to the logger. */
export function printApplyResult(result: ApplyResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : ''
  if (result.created.length) {
    log(`${prefix}Created:`)
    result.created.forEach((p) => log(`  + ${p}`))
  }
  if (result.updated.length) {
    log(`${prefix}Updated:`)
    result.updated.forEach((p) => log(`  ~ ${p}`))
  }
  if (result.deleted.length) {
    log(`${prefix}Deleted (orphaned):`)
    result.deleted.forEach((p) => log(`  x ${p}`))
  }
  const silentlySkipped = result.skipped.filter((p) => !result.userOwned.includes(p))
  if (silentlySkipped.length) {
    log(`${prefix}Skipped:`)
    silentlySkipped.forEach((p) => log(`  - ${p}`))
  }
  if (result.hookIds.length) {
    log(`${prefix}Hooks added: ${result.hookIds.join(', ')}`)
  }
  if (result.drift) {
    warn('Install drift detected — run `haus install` to sync.')
  }
}
