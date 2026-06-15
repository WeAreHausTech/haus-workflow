# Companion Tool Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a haus global install, print suggestions for two third-party token/context-saving tools (Caveman, RTK) that the user does not already have installed — without auto-installing anything.

**Architecture:** A new self-contained module `src/install/companion-tools.ts` holds typed tool configs, a `command -v` detector, a pure suggestion-text builder, and a print orchestrator. `runInstall` in `src/commands/install.ts` calls the orchestrator after `printApplyResult`, only on real installs (not `--check`/`--dry-run`). The pure builder is unit-tested with an injected detector so no real binary lookup happens in tests.

**Tech Stack:** TypeScript (ESM), `execa` (already a dependency) for `command -v`, `node:test` + `node:assert/strict` for tests, `tsup` build.

**Source doc:** `docs/superpowers/specs/` design captured in the brainstorming session (suggestion-only; no auto-install; drop per-tool env vars; rely on existing `HAUS_NO_POSTINSTALL=1` gate).

---

## Design decisions (locked)

- **Suggestion-only.** Neither tool is on npm. Caveman installs via `curl … | bash`; RTK is a Rust binary (`brew`/`cargo`). haus must NOT auto-run remote installers — it prints exact commands and lets the user opt in.
- **Skip-if-installed.** Detect each tool with `command -v <bin>` (POSIX, more portable than `which`). If present, do not suggest it (no nagging).
- **PATH caveat.** At npm postinstall time PATH is often narrower than an interactive shell (`/opt/homebrew/bin`, nvm bins may be absent), so detection can false-negative. For suggestion-only this is harmless — worst case is one redundant suggestion line, never a failed install. Documented in code comment, not guarded against.
- **No new env vars.** The existing `HAUS_NO_POSTINSTALL=1` already suppresses the whole postinstall flow; that covers suggestions too. Per-tool env vars were considered and dropped (YAGNI — output is just printed text).
- **No print on `--check` / `--dry-run`.** Those modes report drift / preview; companion suggestions would be noise.

---

## File Structure

- **Create:** `src/install/companion-tools.ts` — tool configs, detector, pure builder, print orchestrator. Single responsibility: companion-tool suggestion text.
- **Modify:** `src/commands/install.ts` — call `printCompanionToolSuggestions()` after `printApplyResult`, gated on not-check / not-dry-run.
- **Create:** `tests/companion-tools.test.js` — unit tests for the pure builder with an injected detector.

---

### Task 1: Companion-tools module — configs + pure builder

**Files:**

- Create: `src/install/companion-tools.ts`
- Test: `tests/companion-tools.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/companion-tools.test.js`:

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPANION_TOOLS, buildCompanionSuggestions } from '../src/install/companion-tools.js'

test('suggests every tool when none are installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, () => false)
  const text = lines.join('\n')
  assert.match(text, /Caveman/)
  assert.match(text, /RTK/)
  // exact install command for caveman is present
  assert.match(text, /install\.sh \| bash/)
  // rtk primary + fallback both present
  assert.match(text, /brew install rtk/)
  assert.match(text, /cargo install --git/)
})

test('skips a tool that is already installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, (bin) => bin === 'rtk')
  const text = lines.join('\n')
  assert.match(text, /Caveman/)
  assert.doesNotMatch(text, /RTK/)
})

test('returns empty array when all tools are installed', () => {
  const lines = buildCompanionSuggestions(COMPANION_TOOLS, () => true)
  assert.deepEqual(lines, [])
})

test('config covers exactly caveman and rtk', () => {
  assert.deepEqual(COMPANION_TOOLS.map((t) => t.bin).sort(), ['caveman', 'rtk'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/companion-tools.test.js`
Expected: FAIL — cannot find module `../src/install/companion-tools.ts` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/install/companion-tools.ts`:

```typescript
/**
 * Companion-tool suggestions printed after a haus global install.
 *
 * These are third-party token/context-saving tools (Caveman, RTK) that haus does
 * NOT install — neither is on npm (Caveman is a shell-script install, RTK a Rust
 * binary), and auto-running remote installers at postinstall is not acceptable.
 * Instead haus prints the exact opt-in install commands for any tool the user
 * does not already have.
 */

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/companion-tools.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/install/companion-tools.ts tests/companion-tools.test.js
git commit -m "feat(install): add companion-tool suggestion builder"
```

---

### Task 2: Detector + print orchestrator

**Files:**

- Modify: `src/install/companion-tools.ts`
- Test: `tests/companion-tools.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/companion-tools.test.js`:

```javascript
import { printCompanionToolSuggestions } from '../src/install/companion-tools.js'

test('printCompanionToolSuggestions prints missing-tool blocks via injected deps', () => {
  const out = []
  printCompanionToolSuggestions({
    isInstalled: () => false,
    log: (msg) => out.push(String(msg ?? '')),
  })
  const text = out.join('\n')
  assert.match(text, /Caveman/)
  assert.match(text, /RTK/)
})

test('printCompanionToolSuggestions prints nothing when all installed', () => {
  const out = []
  printCompanionToolSuggestions({
    isInstalled: () => true,
    log: (msg) => out.push(String(msg ?? '')),
  })
  assert.equal(out.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/companion-tools.test.js`
Expected: FAIL — `printCompanionToolSuggestions` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/install/companion-tools.ts`:

```typescript
import { execaSync } from 'execa'

import { log } from '../utils/logger.js'

/**
 * Real detector: returns true when `command -v <bin>` resolves.
 *
 * NOTE: at npm postinstall time PATH is often narrower than an interactive shell
 * (Homebrew / nvm bins may be absent), so this can false-negative. That is harmless
 * for suggestion-only output — worst case is one redundant suggestion line.
 */
export function commandExists(bin: string): boolean {
  try {
    // `command -v` is a shell builtin → run through a shell.
    const r = execaSync('sh', ['-c', `command -v ${bin}`], { reject: false })
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/companion-tools.test.js`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/install/companion-tools.ts tests/companion-tools.test.js
git commit -m "feat(install): add command -v detector and print orchestrator"
```

---

### Task 3: Wire into `runInstall`

**Files:**

- Modify: `src/commands/install.ts`

- [ ] **Step 1: Add the import**

At the top of `src/commands/install.ts`, alongside the existing imports, add:

```typescript
import { printCompanionToolSuggestions } from '../install/companion-tools.js'
```

- [ ] **Step 2: Call after printApplyResult, gated on real installs**

In `runInstall`, the suggestions must print only on a real install (not `--check`, not `--dry-run`). Locate the existing block:

```typescript
    } else if (!options.check && !options.dryRun) {
      const total = result.created.length + result.updated.length
```

Immediately **before** that `const total` line, insert the suggestion call so it runs for both postinstall and interactive real installs:

```typescript
    } else if (!options.check && !options.dryRun) {
      printCompanionToolSuggestions()
      const total = result.created.length + result.updated.length
```

- [ ] **Step 3: Build and verify the wiring**

Run: `yarn build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Smoke-test against a temp HOME (no real ~/.claude writes)**

Run:

```bash
yarn build && HOME=$(mktemp -d) node dist/cli.js install --dry-run
```

Expected: dry-run output, and NO companion-tool suggestion block (dry-run is gated out).

Run:

```bash
yarn build && HOME=$(mktemp -d) node dist/cli.js install 2>&1 | tail -20
```

Expected: install completes AND the "Optional token-saving tools you can add:" block appears for any tool not on the temp-HOME PATH.

- [ ] **Step 5: Commit**

```bash
git add src/commands/install.ts
git commit -m "feat(install): surface companion-tool suggestions after install"
```

---

### Task 4: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `yarn verify`
Expected: typecheck + lint + build + test all pass. New tests in `tests/companion-tools.test.js` are picked up by the `tests/**/*.test.js` glob.

- [ ] **Step 2: Confirm no regression in existing install tests**

Run: `node --import tsx --test tests/apply.test.js tests/commands-cli.test.js`
Expected: PASS — companion-tool printing did not disturb existing install flow assertions. If `commands-cli.test.js` asserts exact install stdout, update those assertions to tolerate the appended suggestion block.

- [ ] **Step 3: Commit any test adjustments**

```bash
git add tests/
git commit -m "test(install): account for companion-tool suggestion output"
```

---

## Acceptance criteria

1. Running `haus install` (real install) prints an "Optional token-saving tools" block listing Caveman and RTK with exact install commands and repo URLs — only for tools not already on PATH.
2. A tool returning success from `command -v` is silently skipped (no suggestion line).
3. `haus install --check` and `haus install --dry-run` print NO companion-tool block.
4. `HAUS_NO_POSTINSTALL=1 npm install -g @haus-tech/haus-workflow` runs no postinstall at all (existing behavior, unchanged) — so no suggestions either.
5. haus never executes a companion tool's installer; it only prints commands.
6. `yarn verify` passes.

## Out of scope (YAGNI)

- Auto-installing either tool.
- Per-tool opt-out env vars.
- A catalog entry for either tool (these are global-install suggestions, not per-project context assets).
- Persisting "already suggested" state across installs.
