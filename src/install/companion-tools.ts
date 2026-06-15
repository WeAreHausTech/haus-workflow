/**
 * Companion-tool suggestions printed after a haus global install.
 *
 * These are third-party token/context-saving tools (Caveman, RTK) that haus does
 * NOT install — neither is on npm (Caveman is a shell-script install, RTK a Rust
 * binary), and auto-running remote installers at postinstall is not acceptable.
 * Instead haus prints the exact opt-in install commands for any tool the user
 * does not already have.
 */

import { execaSync } from 'execa'

import { log } from '../utils/logger.js'

/** A third-party tool haus can suggest (never auto-install). */
export interface CompanionTool {
  /** Binary name probed via `command -v`. */
  bin: string
  /** Human-facing label. */
  label: string
  /** One-line value proposition. */
  blurb: string
  /** Exact install command(s) the user can copy-paste. */
  installCmds: string[]
  /** Upstream repository URL. */
  url: string
  /** Optional caveat printed under the commands (e.g. name-collision warning). */
  note?: string
}

/** The tools haus suggests. Add a new entry here to suggest another tool. */
export const COMPANION_TOOLS: readonly CompanionTool[] = [
  {
    bin: 'caveman',
    label: 'Caveman',
    blurb: 'Ultra-compressed Claude Code responses — cuts output tokens ~75%.',
    installCmds: [
      'curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash',
    ],
    url: 'https://github.com/JuliusBrussee/caveman',
  },
  {
    bin: 'rtk',
    label: 'RTK (Rust Token Killer)',
    blurb: 'Token-optimized CLI proxy — 60-90% savings on dev operations.',
    installCmds: [
      'brew install rtk',
      'cargo install --git https://github.com/rtk-ai/rtk   # if Homebrew is unavailable',
    ],
    url: 'https://github.com/rtk-ai/rtk',
    note: 'Another crate named "rtk" (Rust Type Kit) exists on crates.io — use the commands above, not a bare `cargo install rtk`.',
  },
]

/** Predicate: is a binary installed? Injected in tests; real impl uses `command -v`. */
export type IsInstalled = (bin: string) => boolean

/**
 * Pure builder: returns the suggestion notice as an array of lines, one block per
 * not-yet-installed tool. Returns [] when every tool is already installed.
 */
export function buildCompanionSuggestions(
  tools: readonly CompanionTool[],
  isInstalled: IsInstalled,
): string[] {
  const missing = tools.filter((t) => !isInstalled(t.bin))
  if (missing.length === 0) return []

  const lines: string[] = ['', 'Optional token-saving tools you can add:']
  for (const tool of missing) {
    lines.push('', `  ${tool.label} — ${tool.blurb}`)
    for (const cmd of tool.installCmds) {
      lines.push(`    ${cmd}`)
    }
    if (tool.note) lines.push(`    note: ${tool.note}`)
    lines.push(`    ${tool.url}`)
  }
  return lines
}

/**
 * Real detector: returns true when `command -v <bin>` resolves.
 *
 * NOTE: at npm postinstall time PATH is often narrower than an interactive shell
 * (Homebrew / nvm bins may be absent), so this can false-negative. That is harmless
 * for suggestion-only output — worst case is one redundant suggestion line.
 */
function commandExists(bin: string): boolean {
  try {
    // `command -v` is a shell builtin → run through a shell; pass bin as $1 to avoid injection.
    const r = execaSync('sh', ['-c', 'command -v -- "$1"', 'probe', bin], { reject: false })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/** Dependencies for the print orchestrator — injectable for tests. */
export interface PrintDeps {
  isInstalled?: IsInstalled
  log?: (msg?: unknown) => void
}

/**
 * Detects which companion tools are missing and prints opt-in install suggestions.
 * Safe to call unconditionally on a real install; no-ops when every tool is present.
 */
export function printCompanionToolSuggestions(deps: PrintDeps = {}): void {
  const isInstalled = deps.isInstalled ?? commandExists
  const emit = deps.log ?? log
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, isInstalled)
  for (const line of lines) emit(line)
}
