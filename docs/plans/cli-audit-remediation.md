# CLI Audit Remediation (sections 1, 2, 5, 6) Implementation Plan

**Goal:** Fix both confirmed bugs, mitigate all eight possible-bug findings, land the three refactor items, and DRY the four duplication findings from the haus-workflow CLI audit — i.e. sections **1 (current bugs)**, **2 (possible bugs)**, **5 (refactor)**, **6 (DRY/optimize)** of the audit — then update the published audit artifact so its status matches reality.

**Architecture:** One feature branch, tasks executed sequentially where they touch the same file (`remote-catalog.ts` is touched by 5 tasks and must go last-split; `doctor.ts`/`write-workflow.ts` share a new tamper-check helper). Tasks that touch disjoint files (guard-bash, hash-installed, undo, read-context, git-signal, setup-core move, write-claude-files stub dedup) have no ordering dependency on each other and may be done in any order or dispatched to parallel subagents in worktrees if desired — this plan lists them in a safe default order.

**Tech Stack:** TypeScript, Node test runner (`node scripts/run-tests.mjs tests/**/*.test.js`), esbuild build (`yarn build`), existing `fs-extra`/`fast-glob` deps — no new dependencies.

**User decisions (already made):**

- Scope is exactly audit sections 1, 2, 5, 6 (not 3/4/7/8/9 — those are separate future work).
- The published audit artifact (Artifact URL from this conversation, source file `haus-audit-report.html`) must be updated to reflect fixed/mitigated status once this plan lands, so it doesn't go stale.
- L4 ("stale items only cleaned up on manifest removal, never on eligibility loss") is mitigated conservatively: `doctor` gains an advisory suggestion, not an automatic deletion — deleting a file just because eligibility rules changed this run is a destructive action with no undo path, which conflicts with this repo's own "no destructive shortcuts" rule. If the user wants outright pruning later, that's audit section 9 item 4, out of scope here.

**Reference:** [WORKFLOW.md](../../.haus-workflow/WORKFLOW.md) step 3 (plan format), [workflow-config.md](../../.haus-workflow/workflow-config.md) (test commands, highest-stakes files).

---

## Before starting: create the isolated workspace

Per `.haus-workflow/WORKFLOW.md` step 4 — never edit on `main`:

```bash
git worktree add .claude/worktrees/cli-audit-remediation -b fix/cli-audit-remediation
cd .claude/worktrees/cli-audit-remediation
```

All tasks below assume you're inside that worktree.

---

### Task 1: Fix dry-run stale-cache bug in `readWorkflowTemplate` (audit §1, B1)

**Goal:** `haus apply --dry-run` returns the freshly fetched template text, never a stale cached copy, while still honoring the "no filesystem writes during dry-run" contract.

**Files:**

- Modify: `src/catalog/remote-catalog.ts:219-235`
- Test: `tests/remote-catalog-utils.test.js`

**Acceptance Criteria:**

- [ ] When `dryRun: true` and a fetch succeeds, `readWorkflowTemplate` returns the freshly fetched text even if a different cached copy exists on disk.
- [ ] When `dryRun: true`, the cache file on disk is never written or modified.
- [ ] When the fetch fails (`text === null`) and dry-run is set, the existing cache is still returned as a fallback (unchanged behavior).
- [ ] Existing test `readWorkflowTemplate writes cache on non-dry run` still passes unmodified.

**Verify:** `node scripts/run-tests.mjs tests/remote-catalog-utils.test.js` → all pass, including new test.

**Steps:**

- [ ] **Step 1: Write the failing test** — add to `tests/remote-catalog-utils.test.js`:

```js
test('readWorkflowTemplate dry-run returns fresh fetch, not a stale cache', async () => {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'haus-rc-stale-'))
  const prevCache = process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  const prevFetch = globalThis.fetch
  process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = cacheDir
  process.env.HAUS_CATALOG_REMOTE_BASE = 'https://example.test'
  try {
    // Seed a stale cached copy, as if a previous non-dry-run had written it.
    const cachedPath = path.join(cacheDir, 'templates', 'agentic-workflow-standard.md')
    mkdirSync(path.dirname(cachedPath), { recursive: true })
    writeFileSync(cachedPath, '# OLD CACHED TEMPLATE\n', 'utf8')
    const statBefore = require('node:fs').statSync(cachedPath)

    globalThis.fetch = async () => ({ ok: true, text: async () => '# NEW REMOTE TEMPLATE\n' })

    const text = await readWorkflowTemplate({ dryRun: true })

    assert.equal(
      text,
      '# NEW REMOTE TEMPLATE\n',
      'dry-run must return the fresh fetch, not the stale cache',
    )
    const statAfter = require('node:fs').statSync(cachedPath)
    assert.equal(statAfter.mtimeMs, statBefore.mtimeMs, 'dry-run must not write to the cache file')
    assert.equal(
      require('node:fs').readFileSync(cachedPath, 'utf8'),
      '# OLD CACHED TEMPLATE\n',
      'cache content on disk must remain untouched during dry-run',
    )
  } finally {
    globalThis.fetch = prevFetch
    if (prevCache === undefined) delete process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE
    else process.env.HAUS_CATALOG_CACHE_DIR_OVERRIDE = prevCache
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})
```

Add `import { statSync } from 'node:fs'` to the top imports instead of the inline `require` above (this file uses ESM imports elsewhere) — use `statSync` directly, not `require('node:fs')`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/remote-catalog-utils.test.js`
  Expected: FAIL — `text` equals `'# OLD CACHED TEMPLATE\n'` instead of the fresh fetch.

- [ ] **Step 3: Fix `readWorkflowTemplate`** — replace lines 219-235 of `src/catalog/remote-catalog.ts`:

```ts
export async function readWorkflowTemplate(
  opts: { dryRun?: boolean } = {},
): Promise<string | null> {
  const dest = path.join(getCacheDir(), WORKFLOW_TEMPLATE_REL)
  const base = await remoteBase()
  const text = await fetchText(`${base}/${WORKFLOW_TEMPLATE_REL}`)
  if (text === null) {
    if (await fs.pathExists(dest)) return fs.readFile(dest, 'utf8')
    return null
  }
  if (!opts.dryRun) {
    await writeTextIfChanged(dest, text)
  }
  return text
}
```

(Removes the `else if (await fs.pathExists(dest))` branch entirely — a successful fresh fetch is always what gets returned; only a _failed_ fetch falls back to the cache, which is already handled above.)

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/remote-catalog-utils.test.js`
  Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote-catalog.ts tests/remote-catalog-utils.test.js
git commit -m "fix: dry-run readWorkflowTemplate no longer returns a stale cache"
```

---

### Task 2: Fix `checkLock`'s `catalogRef` derivation (audit §1, B2)

**Goal:** `checkLock` finds `catalogRef` the same way `readLockSummary` does — the first item that actually carries it, not blindly item 0 — so `haus update --check`'s "behind" signal can't go stale from a mixed-shape lock.

**Files:**

- Modify: `src/update/lockfile.ts:67`
- Test: `tests/lockfile.test.js`

**Acceptance Criteria:**

- [ ] A lock where item 0 has no `catalogRef` but item 1 does returns that later `catalogRef` from `checkLock`, matching `readLockSummary`'s existing behavior.
- [ ] Existing test `checkLock: catalogRef is taken from first item` still passes (item 0 does carry it there, so behavior is unchanged for that case).

**Verify:** `node scripts/run-tests.mjs tests/lockfile.test.js` → all pass, including new test.

**Steps:**

- [ ] **Step 1: Write the failing test** — add to `tests/lockfile.test.js`, near the existing `catalogRef is taken from first item` test:

```js
test('checkLock: falls back to a later item when the first has no catalogRef', async () => {
  writeLock([
    { id: 'skill.a', type: 'skill' },
    { id: 'skill.b', type: 'skill', catalogRef: 'v2.0.0' },
  ])
  const result = await checkLock(tmpDir)
  assert.equal(result.catalogRef, 'v2.0.0')
})
```

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/lockfile.test.js`
  Expected: FAIL — `result.catalogRef` is `null` (item 0 has no `catalogRef`).

- [ ] **Step 3: Fix `checkLock`** — in `src/update/lockfile.ts`, change line 67:

```ts
// before
const catalogRef = lock[0]?.catalogRef ?? null

// after
const catalogRef = lock.find((item) => item.catalogRef)?.catalogRef ?? null
```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/lockfile.test.js`
  Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/update/lockfile.ts tests/lockfile.test.js
git commit -m "fix: checkLock finds catalogRef on any lock item, not just the first"
```

---

### Task 3: Harden the bash guard against quote-based evasion (audit §2, L1)

**Goal:** `guardBash` still hard-blocks a deny-tier command when the operator has inserted quote characters inside the dangerous phrase (e.g. `git push --forc"e" origin main`), without changing any existing pass/block behavior.

**Files:**

- Modify: `src/security/guard-bash.ts`
- Test: `tests/guard.test.js`

**Acceptance Criteria:**

- [ ] `guardBash('git push --forc"e" origin main')` returns a block message.
- [ ] `guardBash("git push --force origin main")` (no quotes) still blocks, unchanged.
- [ ] All existing `guard.test.js` assertions still pass unmodified (no false positives introduced on ordinary commands containing quotes, e.g. `git commit -m "fix: sudo-proof retries"`).
- [ ] Documented limitation stays honest: this closes the literal-quoting gap, not general shell obfuscation (`$(...)`, variable indirection) — noted in a code comment, not oversold in the fix.

**Verify:** `node scripts/run-tests.mjs tests/guard.test.js` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — add to `tests/guard.test.js`, inside `describe('guardBash', ...)`:

```js
it('blocks deny-tier commands split by quote characters (audit L1)', () => {
  assert.ok(guardBash('git push --forc"e" origin main'))
  assert.ok(guardBash("git push --forc'e' origin main"))
  assert.ok(guardBash('npm  pu"b"lish'))
})

it('does not false-positive on quoted text that merely mentions a safe word', () => {
  assert.equal(guardBash('git commit -m "note: avoid sudo in scripts"'), undefined)
})
```

Note: the second test intentionally still contains the literal word `sudo` inside quotes — sudo _should_ still block per the existing `matchesDenyToken` sudo-specific regex (anchored to command start/separator, not inside a quoted string mid-command it wouldn't match anyway since `sudo` isn't at start/after `[|;&]`). Confirm this reflects real existing behavior before asserting it (run existing suite first) — if it currently blocks, delete this second test rather than assert a not-yet-true behavior change; the goal here is zero regression, not a new sudo carve-out.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/guard.test.js`
  Expected: FAIL — quoted variants of `git push --force`/`npm publish` are not detected.

- [ ] **Step 3: Fix `matchesDenyToken`** — in `src/security/guard-bash.ts`:

```ts
function matchesDenyToken(command: string, denyPhrase: string): boolean {
  if (denyPhrase === 'sudo') {
    return /(?:^|[|;&]\s*)sudo\b/i.test(command)
  }
  // Strip quote characters before matching so a deny-tier phrase split across
  // quotes (e.g. `--forc"e"`) still resolves to its unquoted form. This closes
  // the literal-quoting gap only — general shell obfuscation via $(...) or
  // variable indirection is a separate, harder problem this guard does not solve.
  const normalizedCommand = command.replace(/["'`]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return normalizedCommand.includes(denyPhrase.toLowerCase())
}
```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/guard.test.js`
  Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/security/guard-bash.ts tests/guard.test.js
git commit -m "fix: guardBash strips quote characters before deny-phrase match"
```

---

### Task 4: Shared tamper-check helper + doctor legacy-header detection (audit §2 L2, §6 dup)

**Goal:** Extract the "compare on-disk body hash to a template's hash" logic that `write-workflow.ts` and `doctor.ts` each currently reimplement into one shared helper, and use it to make `doctor` correctly flag a genuinely-edited legacy-header (no `hash=` field) WORKFLOW.md instead of unconditionally reporting "OK".

**Files:**

- Create: `src/claude/managed-tamper.ts`
- Modify: `src/claude/write-workflow.ts:74-115` (use the new helper)
- Modify: `src/commands/doctor.ts:152-195` (use the new helper, add legacy-header branch)
- Test: `tests/doctor-tamper.test.js`

**Acceptance Criteria:**

- [ ] A WORKFLOW.md with a legacy header (`id=`/`v=` present, no `hash=` field) whose body no longer matches the current template content is flagged by `doctor` as needing attention (not reported "OK").
- [ ] A legacy-header WORKFLOW.md whose body still matches the current template is reported OK (just eligible for header migration on next `apply --write`, which is unchanged existing behavior).
- [ ] A valid-hash WORKFLOW.md whose body was tampered still flags exactly as before (no regression on the existing `doctor-tamper.test.js` test).
- [ ] `write-workflow.ts`'s existing tamper/migration behavior (verified by `tests/write-workflow-force.test.js` and `tests/write-workflow.test.js`) is unchanged after the extraction.

**Verify:** `node scripts/run-tests.mjs tests/doctor-tamper.test.js tests/write-workflow.test.js tests/write-workflow-force.test.js tests/doctor.test.js` → all pass.

**Steps:**

- [ ] **Step 1: Create the shared helper** — `src/claude/managed-tamper.ts`:

```ts
/**
 * Shared tamper/staleness comparison for HAUS-MANAGED template files (WORKFLOW.md
 * today). Used by both the writer (write-workflow.ts) and the reader (doctor.ts) so
 * the two never independently drift on what counts as "tampered" vs "stale".
 */
import { hashText } from '../utils/fs.js'

import { normaliseLF } from './managed-template.js'

export type ManagedTamperVerdict =
  | { status: 'ok' }
  | { status: 'tampered' } // hash present and body no longer matches it
  | { status: 'stale' } // hash matches template's old hash, template itself changed
  | { status: 'legacy-ok' } // no verifiable hash, but body matches current template
  | { status: 'legacy-diverged' } // no verifiable hash, body does NOT match current template

/**
 * Compares an installed managed file's body against its own recorded hash (if any)
 * and the current template content, returning one verdict for callers to act on.
 *
 * @param body - The installed file's content, with the HAUS-MANAGED header line stripped.
 * @param storedHash - The `hash=sha256-...` value from the file's header, or undefined
 *   when the header predates hashing (legacy) or the hash field is otherwise absent.
 * @param templateContent - The current template content to compare staleness against,
 *   or null when it could not be resolved (cache and bundled snapshot both missing).
 */
export function checkManagedTamper(
  body: string,
  storedHash: string | undefined,
  templateContent: string | null,
): ManagedTamperVerdict {
  const bodyHash = hashText(normaliseLF(body))

  if (storedHash) {
    if (bodyHash !== storedHash) return { status: 'tampered' }
    if (templateContent === null) return { status: 'ok' }
    const currentTemplateHash = hashText(normaliseLF(templateContent))
    return storedHash !== currentTemplateHash ? { status: 'stale' } : { status: 'ok' }
  }

  // No verifiable hash (legacy header). We can only compare the body against the
  // CURRENT template — we have no record of what hash the body was written with.
  if (templateContent === null) return { status: 'legacy-ok' }
  const currentTemplateHash = hashText(normaliseLF(templateContent))
  return bodyHash === currentTemplateHash ? { status: 'legacy-ok' } : { status: 'legacy-diverged' }
}
```

- [ ] **Step 2: Use the helper in `write-workflow.ts`** — replace the tamper-check block at lines 74-115 of `src/claude/write-workflow.ts`:

```ts
const existingContent = existing.slice(firstLine.length + 1)
const verdict = checkManagedTamper(existingContent, parsed.hash, templateContent)

if (verdict.status === 'tampered' && !force) {
  warn(`${printable}: content modified by user — skipping. Use --force to overwrite.`)
  return null
}

if (verdict.status === 'legacy-diverged' && !force) {
  // Body differs and we can't verify — preserve body, migrate header only.
  const migratedHeader = makeWorkflowHeader(pkgVersion, hashText(normaliseLF(existingContent)))
  const migrated = `${migratedHeader}\n${existingContent}`
  if (hasTextChanged(existing, migrated)) {
    if (dryRun) {
      log(`${printable}: migrating legacy hash header (body preserved)`)
    } else {
      await writeText(destPath, migrated)
    }
  } else if (dryRun) {
    log(`${printable}: unchanged`)
  }
  return destPath
}

if (!hasTextChanged(existing, next)) {
  if (dryRun) log(`${printable}: unchanged`)
  return destPath
}
```

Add the import: `import { checkManagedTamper } from './managed-tamper.js'` and remove the now-unused inline `bodyMatchesTemplate` local (the helper computes the equivalent internally). Leave everything above (header parsing, id/version checks) and below (dry-run diff printing, final write) unchanged.

- [ ] **Step 3: Use the helper in `doctor.ts`** — replace lines 158-193 of `src/commands/doctor.ts`:

```ts
const storedHashMatch = firstLine.match(/hash=(sha256-[a-f0-9]+)/)
const bodyContent = workflowContent.slice(firstLine.length + 1)
const cachePath = path.join(getCacheDir(), 'templates/agentic-workflow-standard.md')
const bundledPath = path.join(
  packageRoot(),
  'library',
  'global',
  'templates',
  'agentic-workflow-standard.md',
)
const templatePath = (await fs.pathExists(cachePath)) ? cachePath : bundledPath
const templateContent = await readText(templatePath)
const verdict = checkManagedTamper(bodyContent, storedHashMatch?.[1], templateContent ?? null)

if (verdict.status === 'tampered' || verdict.status === 'legacy-diverged') {
  flag(
    '- .haus-workflow/WORKFLOW.md: modified locally (run `haus apply --write --force` to restore)',
    'The workflow standard file was edited after haus wrote it',
    'haus apply --write --force',
  )
} else if (verdict.status === 'stale') {
  suggest(
    '- .haus-workflow/WORKFLOW.md: stale (template updated — run `haus apply --write`)',
    'The workflow standard is out of date',
    'haus apply --write',
  )
} else {
  ok('- .haus-workflow/WORKFLOW.md: OK')
}
```

Add the import: `import { checkManagedTamper } from '../claude/managed-tamper.js'`.

- [ ] **Step 4: Add the regression test** — add to `tests/doctor-tamper.test.js` a second test, `doctor flags a legacy-header WORKFLOW.md whose body has diverged from the template`, following the same pattern as the existing test but writing a header with no `hash=` field (e.g. `<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@0.18.2 -->\nLOCALLY EDITED\n`), and asserting the output matches `/modified locally|edited after haus wrote it/i` with `process.exitCode === 1` — same assertions as the existing test, new input shape.

- [ ] **Step 5: Run tests to verify everything passes**

  Run: `node scripts/run-tests.mjs tests/doctor-tamper.test.js tests/write-workflow.test.js tests/write-workflow-force.test.js tests/doctor.test.js`
  Expected: PASS, all tests in all four files.

- [ ] **Step 6: Commit**

```bash
git add src/claude/managed-tamper.ts src/claude/write-workflow.ts src/commands/doctor.ts tests/doctor-tamper.test.js
git commit -m "fix: doctor detects tamper on legacy-header WORKFLOW.md via shared helper"
```

---

### Task 5: Hash file content by bytes, not lossy UTF-8 text (audit §2, L3)

**Goal:** `hashInstalledPaths` no longer corrupts binary content before hashing — text files are still normalized (LF, for cross-platform stability); non-UTF-8 files are hashed by raw bytes.

**Files:**

- Modify: `src/update/hash-installed.ts`
- Test: create `tests/hash-installed.test.js` (no dedicated test file exists today)

**Acceptance Criteria:**

- [ ] A file containing invalid UTF-8 byte sequences (e.g. a raw PNG-like byte pattern) hashes deterministically and differently from a similar-but-different binary file — i.e. the hash reflects actual bytes, not a lossy re-encoding.
- [ ] A markdown/text file's hash is unaffected by this change (same hash before/after, verified against the current `EMPTY_LOCK_PATHS_TOKEN` and existing lockfile tests which exercise text files).
- [ ] `node scripts/run-tests.mjs tests/lockfile.test.js` (which exercises `hashInstalledPaths` transitively via `applyLock`/`checkLock`) still passes unmodified.

**Verify:** `node scripts/run-tests.mjs tests/hash-installed.test.js tests/lockfile.test.js` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — create `tests/hash-installed.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { hashInstalledPaths, EMPTY_LOCK_PATHS_TOKEN } from '../src/update/hash-installed.js'
import { hashText } from '../src/utils/fs.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-hash-installed-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('hashInstalledPaths returns the empty-paths token for an empty path list', async () => {
  const result = await hashInstalledPaths(tmpDir, [])
  assert.equal(result, hashText(EMPTY_LOCK_PATHS_TOKEN))
})

test('hashInstalledPaths hashes a text file identically across LF/CRLF (normalization intact)', async () => {
  fs.writeFileSync(path.join(tmpDir, 'a.md'), 'line one\nline two\n', 'utf8')
  fs.writeFileSync(path.join(tmpDir, 'b.md'), 'line one\r\nline two\r\n', 'utf8')
  const hashA = await hashInstalledPaths(tmpDir, ['a.md'])
  const hashB = await hashInstalledPaths(tmpDir, ['b.md'])
  assert.equal(hashA, hashB, 'LF and CRLF text content must hash identically')
})

test('hashInstalledPaths hashes binary content by raw bytes, not lossy UTF-8 text', async () => {
  // Bytes that are invalid as UTF-8 (a lone continuation byte, 0xFF, 0xFE) — decoding
  // and re-encoding these as 'utf8' replaces them with U+FFFD, collapsing distinct
  // inputs to the same lossy text and therefore the same (wrong) hash.
  const binaryA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xd8, 0xff, 0x00, 0x01])
  const binaryB = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xd8, 0xff, 0x00, 0x02])
  fs.writeFileSync(path.join(tmpDir, 'a.bin'), binaryA)
  fs.writeFileSync(path.join(tmpDir, 'b.bin'), binaryB)
  const hashA = await hashInstalledPaths(tmpDir, ['a.bin'])
  const hashB = await hashInstalledPaths(tmpDir, ['b.bin'])
  assert.notEqual(hashA, hashB, 'distinct binary content must not collapse to the same hash')
})

test('hashInstalledPaths expands a directory to its nested files, mixing text and binary', async () => {
  fs.mkdirSync(path.join(tmpDir, 'skill'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'skill', 'SKILL.md'), '# skill\n', 'utf8')
  fs.writeFileSync(path.join(tmpDir, 'skill', 'asset.bin'), Buffer.from([0xff, 0xfe, 0x00]))
  const hash = await hashInstalledPaths(tmpDir, ['skill'])
  assert.ok(hash.startsWith('sha256-'))
})
```

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/hash-installed.test.js`
  Expected: FAIL on the binary-content test — both binary files decode to the same lossy UTF-8 text (U+FFFD replacement chars) and hash equal.

- [ ] **Step 3: Fix `hashInstalledPaths`** — replace `src/update/hash-installed.ts` in full:

```ts
/**
 * Hashes the content of installed files and directories to detect local modifications
 * since the last `haus install` or `haus update` run.
 */
import path from 'node:path'

import fg from 'fast-glob'
import fs from 'fs-extra'

import { normaliseLF } from '../claude/managed-template.js'
import { hashText } from '../utils/fs.js'

/** Deterministic hash when a lock item has no installed paths yet. */
export const EMPTY_LOCK_PATHS_TOKEN = 'haus-lock:empty-paths'

/**
 * Digests one file's content. Text (valid UTF-8, matching JS's lossless decode/encode
 * round-trip) is LF-normalized first so line-ending changes alone don't register as
 * drift. Anything that doesn't round-trip losslessly (binary content) is hashed by its
 * raw bytes instead — decoding it as UTF-8 first would replace invalid byte sequences
 * with U+FFFD, silently collapsing distinct binary content to the same hash.
 */
function digestFileContent(buf: Buffer): string {
  const asText = buf.toString('utf8')
  const roundTrip = Buffer.from(asText, 'utf8')
  if (roundTrip.equals(buf)) {
    return hashText(normaliseLF(asText))
  }
  return hashText(buf)
}

/**
 * Content-addressed hash for paths under `root` (files or directories).
 * Directories are expanded to all nested files. Missing paths are skipped.
 */
export async function hashInstalledPaths(root: string, relPaths: string[]): Promise<string> {
  if (relPaths.length === 0) {
    return hashText(EMPTY_LOCK_PATHS_TOKEN)
  }
  const normalized = [...new Set(relPaths.map((p) => p.replace(/\\/g, '/')))].sort()
  const fileDigests: Array<{ rel: string; digest: string }> = []

  for (const rel of normalized) {
    const abs = path.join(root, rel)
    if (!(await fs.pathExists(abs))) continue
    const stat = await fs.stat(abs)
    if (stat.isFile()) {
      const body = await fs.readFile(abs)
      fileDigests.push({ rel, digest: digestFileContent(body) })
      continue
    }
    if (!stat.isDirectory()) continue
    const inner = await fg('**/*', { cwd: abs, onlyFiles: true, dot: true })
    for (const sub of inner.sort()) {
      const relFile = path.join(rel, sub).replace(/\\/g, '/')
      const absFile = path.join(abs, sub)
      const body = await fs.readFile(absFile)
      fileDigests.push({ rel: relFile, digest: digestFileContent(body) })
    }
  }

  if (fileDigests.length === 0) {
    return hashText(`${EMPTY_LOCK_PATHS_TOKEN}|${normalized.join('|')}`)
  }
  fileDigests.sort((a, b) => a.rel.localeCompare(b.rel))
  return hashText(fileDigests.map((f) => `${f.rel}=${f.digest}`).join('|'))
}
```

This assumes `hashText` accepts a `Buffer` in addition to a `string` — check `src/utils/fs.ts`'s `hashText` signature; if it's typed `(text: string) => string` using `crypto.createHash('sha256').update(text)`, `createHash().update()` already accepts a `Buffer` at runtime, so widen the TypeScript signature to `hashText(input: string | Buffer): string` rather than adding a second function.

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/hash-installed.test.js tests/lockfile.test.js`
  Expected: PASS, all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add src/update/hash-installed.ts tests/hash-installed.test.js src/utils/fs.ts
git commit -m "fix: hash installed files by raw bytes, not lossy UTF-8 text"
```

---

### Task 6: Doctor surfaces catalog items that fell out of eligibility (audit §2, L4)

**Goal:** `doctor` advises when a lock-tracked item is no longer in the current `recommendation.json`'s recommended list (context changed) even though it's still `approved` in the manifest — today these accumulate on disk with zero detection path. Advisory only, no deletion (see plan header rationale).

**Files:**

- Modify: `src/commands/doctor.ts`
- Test: `tests/doctor.test.js`

**Acceptance Criteria:**

- [ ] A lock item whose id is absent from `recommendation.json.recommended` triggers a `suggest()` advisory naming the item, when that item is not already covered by the existing stale/deprecated-manifest-removal messaging (which is a `write-claude-files.ts` concern, not doctor's — doctor only reports, it doesn't know why an item became ineligible).
- [ ] A lock item whose id IS in the current recommendation is not flagged.
- [ ] Existing `doctor.test.js` assertions are unaffected (no new blocking `flag()`, so exit code behavior is unchanged for existing fixtures).

**Verify:** `node scripts/run-tests.mjs tests/doctor.test.js` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — add to `tests/doctor.test.js`, following its existing fixture-setup pattern (mirror `doctor-tamper.test.js`'s `.haus-workflow/` fixture writing): write a `haus.lock.json` with one item (`id: 'skill.orphaned'`) and a `recommendation.json` whose `recommended` array does NOT include that id, then run `runDoctor()` and assert the captured output matches `/skill\.orphaned/` and `/no longer (recommended|in the current recommendation)/i`.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/doctor.test.js`
  Expected: FAIL — no such message is emitted today.

- [ ] **Step 3: Add the check** — in `src/commands/doctor.ts`, after the existing catalog-cache-age block (after line 258, before the CLI version check), add:

```ts
{
  const lock = await readJson<Array<{ id?: string }>>(hausPath(root, 'haus.lock.json'))
  const recommendedIds = new Set(
    (recommendation?.recommended as Array<{ id?: string }> | undefined)?.map((r) => r.id) ?? [],
  )
  const orphaned = (lock ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && !recommendedIds.has(id))
  if (orphaned.length > 0) {
    suggest(
      `- CATALOG ITEMS: ${orphaned.length} installed item(s) no longer in the current recommendation (${orphaned.join(', ')})`,
      `${orphaned.length} installed item(s) are no longer recommended for this project`,
      'review whether they are still needed; haus apply --write leaves them in place until removed from the catalog',
    )
  }
}
```

This only fires when `recommendation.json` exists and has a `recommended` array — a project with no recommendation file yet (fresh scan not run) has `recommendedIds` empty, which would falsely flag every lock item as orphaned. Guard against that: skip the check entirely when `recommendation` is null.

Revise the added block's condition to open with `if (recommendation) { ... }` wrapping the whole thing, so the check is skipped rather than false-flagging on a missing recommendation file.

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/doctor.test.js`
  Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.ts tests/doctor.test.js
git commit -m "feat: doctor advises when installed catalog items fall out of eligibility"
```

---

### Task 7: `undo` hash-gates lock-tracked file removal (audit §2, L5)

**Goal:** `haus undo` no longer blindly deletes lock-tracked catalog files — it checks each lock entry's own recorded hash against on-disk content first, same as `cleanupStaleCatalogItems` already does, and leaves a modified file in place with a warning instead of destroying it.

**Files:**

- Modify: `src/commands/undo.ts`
- Test: create `tests/undo.test.js` if it doesn't already cover this, or extend it

**Acceptance Criteria:**

- [ ] A lock-tracked file whose current content hash matches the lock entry's `hash` is removed as before.
- [ ] A lock-tracked file whose content has diverged from the lock entry's `hash` is left in place, with a warning naming the file.
- [ ] Core managed files (rules/haus.md, settings.json, WORKFLOW.md, etc. — not lock-tracked catalog items) are still always removed/backed-up as before — this change only affects the lock-tracked catalog item paths, matching the existing hash-gated contract `write-claude-files.ts` already uses for the same category of files.
- [ ] The confirmation summary shown to the user still lists all targets (both categories) as before.

**Verify:** `node scripts/run-tests.mjs tests/undo.test.js` → all pass. If no such file exists yet, create it — check first: `ls tests/undo.test.js`.

**Steps:**

- [ ] **Step 1: Check for an existing test file**

  Run: `ls tests/undo.test.js 2>/dev/null && echo exists || echo missing`

- [ ] **Step 2: Write the failing test** — in `tests/undo.test.js` (new or existing), following the `beforeEach`/`afterEach` tmp-dir pattern from `tests/lockfile.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { runUndo } from '../src/commands/undo.js'

let tmpDir
let prevCwd

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-undo-test-'))
  prevCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('undo leaves a locally-modified lock-tracked file in place with a warning', async () => {
  fs.mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'kept'), { recursive: true })
  fs.writeFileSync(
    path.join(tmpDir, '.claude', 'skills', 'kept', 'SKILL.md'),
    'USER EDITED',
    'utf8',
  )
  fs.writeFileSync(
    path.join(tmpDir, '.haus-workflow', 'haus.lock.json'),
    JSON.stringify([
      {
        id: 'skill.kept',
        type: 'skill',
        paths: ['.claude/skills/kept/SKILL.md'],
        hash: 'sha256-doesnotmatchcurrentcontent',
      },
    ]),
  )

  const lines = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...a) => {
    lines.push(a.join(' '))
    origLog(...a)
  }
  console.warn = (...a) => {
    lines.push(a.join(' '))
    origWarn(...a)
  }
  try {
    await runUndo({ yes: true })
  } finally {
    console.log = origLog
    console.warn = origWarn
  }

  assert.ok(
    fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'kept', 'SKILL.md')),
    'modified lock-tracked file must be preserved, not deleted',
  )
  assert.match(lines.join('\n'), /modified locally|skill\.kept/i)
})

test('undo removes a lock-tracked file whose content matches its recorded hash', async () => {
  fs.mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'removable'), { recursive: true })
  const relPath = '.claude/skills/removable/SKILL.md'
  fs.writeFileSync(path.join(tmpDir, relPath), '# unmodified\n', 'utf8')

  const { hashInstalledPaths } = await import('../src/update/hash-installed.js')
  const hash = await hashInstalledPaths(tmpDir, [relPath])

  fs.writeFileSync(
    path.join(tmpDir, '.haus-workflow', 'haus.lock.json'),
    JSON.stringify([{ id: 'skill.removable', type: 'skill', paths: [relPath], hash }]),
  )

  await runUndo({ yes: true })

  assert.equal(
    fs.existsSync(path.join(tmpDir, relPath)),
    false,
    'unmodified file should be removed',
  )
})
```

- [ ] **Step 3: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/undo.test.js`
  Expected: FAIL on the first test — today's `undo` deletes the modified file unconditionally.

- [ ] **Step 4: Restructure `undo.ts` to hash-gate lock-tracked paths** — in `src/commands/undo.ts`:

  Replace `collectManagedPaths` (lines 22-36) with two separate collectors, and add a hash-gate helper:

```ts
import { hashInstalledPaths } from '../update/hash-installed.js'

type LockRow = { id?: string; paths?: string[]; hash?: string }

/** Absolute paths of core managed files (always safe to remove — no per-file hash to check). */
async function collectCoreManagedPaths(root: string): Promise<string[]> {
  const existing: string[] = []
  for (const abs of coreManagedAbsolutePaths(root)) {
    if (await fs.pathExists(abs)) existing.push(abs)
  }
  return existing
}

/**
 * Lock-tracked catalog item paths, split into those safe to remove (content still
 * matches the recorded hash) and those to leave in place (user-modified since install),
 * mirroring the hash-gated contract `cleanupStaleCatalogItems` already applies on apply.
 */
async function collectLockTrackedPaths(
  root: string,
): Promise<{ removable: string[]; preserved: string[] }> {
  const lock = await readJson<LockRow[]>(hausPath(root, 'haus.lock.json'))
  const removable: string[] = []
  const preserved: string[] = []
  for (const row of lock ?? []) {
    const relPaths = row.paths ?? []
    const existingRel: string[] = []
    for (const rel of relPaths) {
      if (await fs.pathExists(path.resolve(root, rel))) existingRel.push(rel)
    }
    if (existingRel.length === 0) continue
    if (row.hash === undefined) {
      // No recorded hash to verify against — treat as removable (matches historical
      // behavior for entries predating hash tracking; there is nothing to compare).
      removable.push(...existingRel.map((rel) => path.resolve(root, rel)))
      continue
    }
    const currentHash = await hashInstalledPaths(root, relPaths)
    if (currentHash === row.hash) {
      removable.push(...existingRel.map((rel) => path.resolve(root, rel)))
    } else {
      preserved.push(...existingRel.map((rel) => path.resolve(root, rel)))
      log(`Preserving locally-modified ${row.id ?? '(unknown item)'}: ${existingRel.join(', ')}`)
    }
  }
  return { removable, preserved }
}
```

Then in `runUndo`, replace the `const managed = await collectManagedPaths(root)` line and everything downstream that assumed one flat list:

```ts
const coreManaged = await collectCoreManagedPaths(root)
const { removable: lockRemovable, preserved: lockPreserved } = await collectLockTrackedPaths(root)
const managed = [...new Set([...coreManaged, ...lockRemovable])]
const stripSettings = await settingsHasHausContent(root)
const stripClaudeMd = await claudeMdHasHausBlock(root)

if (managed.length === 0 && !stripSettings && !stripClaudeMd) {
  log('Nothing to remove: no haus-managed files found in this directory.')
  return
}

const relTargets = managed.map((p) => path.relative(root, p))
const summaryParts = [...relTargets]
if (stripSettings) summaryParts.push('.claude/settings.json (haus rules only)')
if (stripClaudeMd) summaryParts.push('CLAUDE.md (haus import block only)')
if (lockPreserved.length > 0) {
  summaryParts.push(
    `(preserving ${lockPreserved.length} locally-modified catalog item file(s) — not shown above)`,
  )
}
```

Everything after that (`confirm`, `backupManagedFilesBeforeUndo`, the removal loop, settings/CLAUDE.md stripping, dir pruning) is unchanged — it already operates on `managed`, which now correctly excludes preserved files.

Remove the old `collectManagedPaths` function entirely and its now-unused `LockRow` type re-declaration (the new `type LockRow` above replaces it — keep only one).

- [ ] **Step 5: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/undo.test.js`
  Expected: PASS, both tests.

- [ ] **Step 6: Run the full suite once** (this file's behavior is exercised by other tests too)

  Run: `yarn test`
  Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/commands/undo.ts tests/undo.test.js
git commit -m "fix: undo hash-gates lock-tracked catalog files instead of deleting unconditionally"
```

---

### Task 8: Invalidate the context cache when `package.json` changes (audit §2, L6)

**Goal:** `readContextOrScan` re-scans instead of trusting a cached `context-map.json` when the project's `package.json` has been modified more recently than the cache — closing the "silently stale forever" gap — while still using the cache in the common case (nothing changed).

**Files:**

- Modify: `src/scanner/read-context.ts`
- Test: create `tests/read-context.test.js`

**Acceptance Criteria:**

- [ ] When `context-map.json`'s mtime is newer than `package.json`'s mtime, the cached context is returned (no rescan) — this is the common, fast path and must stay fast.
- [ ] When `package.json`'s mtime is newer than the cache (e.g. a dependency was just added), `scanProject` runs and its fresh result is returned, not the stale cache.
- [ ] When there is no `package.json` at all, the existing cache-preferred behavior is unchanged (nothing to compare against — don't force a rescan on every call for a project with no `package.json`).
- [ ] When there is no cache at all, behavior is unchanged (falls back to a fresh scan, as today).

**Verify:** `node scripts/run-tests.mjs tests/read-context.test.js` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — create `tests/read-context.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { readContextOrScan } from '../src/scanner/read-context.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-read-context-'))
  fs.mkdirSync(path.join(tmpDir, '.haus-workflow'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeCache(repoName) {
  const cachePath = path.join(tmpDir, '.haus-workflow', 'context-map.json')
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      mode: 'fast',
      generatedAt: new Date().toISOString(),
      root: tmpDir,
      repoName,
      packageManager: 'yarn',
      repoRoles: [],
      confidence: 0.5,
      detectedStacks: {
        frontend: [],
        backend: [],
        databases: [],
        testing: [],
        auth: [],
        tooling: [],
        packageManagers: [],
      },
      dependencies: [],
      securityRisks: [],
      crossRepoHints: [],
      warnings: [],
    }),
  )
  return cachePath
}

test('returns the cache when package.json is older than the cached context', async () => {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"old"}', 'utf8')
  const pkgTime = new Date(Date.now() - 60_000)
  fs.utimesSync(path.join(tmpDir, 'package.json'), pkgTime, pkgTime)

  const cachePath = writeCache('cached-repo-name')
  const cacheTime = new Date()
  fs.utimesSync(cachePath, cacheTime, cacheTime)

  const result = await readContextOrScan(tmpDir)
  assert.equal(result.repoName, 'cached-repo-name', 'must use the cache, not rescan')
})

test('rescans when package.json is newer than the cached context', async () => {
  const cachePath = writeCache('stale-cached-name')
  const cacheTime = new Date(Date.now() - 60_000)
  fs.utimesSync(cachePath, cacheTime, cacheTime)

  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fresh-project"}', 'utf8')
  // package.json's mtime defaults to "now", i.e. after cacheTime — no utimes needed.

  const result = await readContextOrScan(tmpDir)
  assert.notEqual(result.repoName, 'stale-cached-name', 'must rescan, not return the stale cache')
})

test('falls back to the cache when there is no package.json to compare against', async () => {
  const cachePath = writeCache('cached-repo-name')
  fs.utimesSync(cachePath, new Date(), new Date())
  const result = await readContextOrScan(tmpDir)
  assert.equal(result.repoName, 'cached-repo-name')
})
```

- [ ] **Step 2: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/read-context.test.js`
  Expected: FAIL on the "rescans when package.json is newer" test — today's implementation always trusts the cache.

- [ ] **Step 3: Fix `read-context.ts`** — replace `src/scanner/read-context.ts` in full:

```ts
/**
 * Reads the cached context map from disk, or runs a scan when the cache is absent
 * or stale relative to package.json.
 * Use this instead of calling scanProject directly when a fresh scan is not required.
 */
import fs from 'fs-extra'
import path from 'node:path'

import type { ContextMap } from '../types.js'
import { readJson } from '../utils/fs.js'
import { hausPath } from '../utils/paths.js'

import { scanProject } from './scan-project.js'

/**
 * True when the cached context map is at least as fresh as package.json. When
 * package.json doesn't exist, there is nothing to compare against, so the cache is
 * treated as fresh (avoids forcing a rescan on every call for such projects).
 */
async function isCacheFresh(root: string, cachePath: string): Promise<boolean> {
  const pkgJsonPath = path.join(root, 'package.json')
  if (!(await fs.pathExists(pkgJsonPath))) return true
  const [cacheStat, pkgStat] = await Promise.all([fs.stat(cachePath), fs.stat(pkgJsonPath)])
  return cacheStat.mtimeMs >= pkgStat.mtimeMs
}

/**
 * Returns the project's ContextMap, preferring the cached copy in `.haus-workflow/context-map.json`
 * when it's at least as fresh as package.json. Falls back to a fresh scan when no cached file
 * exists, or when package.json has changed more recently than the cache.
 *
 * @param root - Absolute path to the project root.
 */
export async function readContextOrScan(root: string): Promise<ContextMap> {
  const cachePath = hausPath(root, 'context-map.json')
  const context = await readJson<ContextMap>(cachePath)
  if (context && (await isCacheFresh(root, cachePath))) return context
  const scan = await scanProject(root)
  return scan
}
```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/read-context.test.js`
  Expected: PASS, all three tests.

- [ ] **Step 5: Run the full suite once** (this is a widely-used function — `doctor`, `recommend`, `apply` all call it)

  Run: `yarn test`
  Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/scanner/read-context.ts tests/read-context.test.js
git commit -m "fix: readContextOrScan rescans when package.json is newer than the cache"
```

---

### Task 9: Git change-signal includes staged and untracked files (audit §2, L7)

**Goal:** `readChangedFiles` (the recommender's git signal) reports files that are staged or untracked, not only unstaged diffs — so a newly-added-but-not-yet-committed file registers as an active work area.

**Files:**

- Modify: `src/recommender/git-signal.ts`
- Test: check for `tests/git-signal.test.js`; extend or create it

**Acceptance Criteria:**

- [ ] A file with unstaged changes is reported (existing behavior, unchanged).
- [ ] A file that has been `git add`-ed (staged, not yet committed) is reported.
- [ ] A new file that has never been added or tracked is reported.
- [ ] The result is deduplicated and sorted (same contract as today).
- [ ] `HAUS_DISABLE_GIT_SIGNALS=1` still short-circuits to `[]` before running any git command.

**Verify:** `node scripts/run-tests.mjs tests/git-signal.test.js` (or the correct existing test filename — check first) → all pass.

**Steps:**

- [ ] **Step 1: Check for an existing test file**

  Run: `ls tests/git-signal.test.js tests/*git-signal* 2>/dev/null`

- [ ] **Step 2: Write/extend the test** — in the located (or new) test file:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, test } from 'node:test'

import { readChangedFiles } from '../src/recommender/git-signal.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haus-git-signal-'))
  execSync('git init -q', { cwd: tmpDir })
  execSync('git config user.email test@example.com', { cwd: tmpDir })
  execSync('git config user.name Test', { cwd: tmpDir })
  fs.writeFileSync(path.join(tmpDir, 'committed.txt'), 'v1\n')
  execSync('git add committed.txt', { cwd: tmpDir })
  execSync('git commit -q -m init', { cwd: tmpDir })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('reports an unstaged change (existing behavior)', async () => {
  fs.writeFileSync(path.join(tmpDir, 'committed.txt'), 'v2\n')
  const files = await readChangedFiles(tmpDir)
  assert.ok(files.includes('committed.txt'))
})

test('reports a staged file', async () => {
  fs.writeFileSync(path.join(tmpDir, 'staged.txt'), 'new\n')
  execSync('git add staged.txt', { cwd: tmpDir })
  const files = await readChangedFiles(tmpDir)
  assert.ok(files.includes('staged.txt'), `expected staged.txt in ${JSON.stringify(files)}`)
})

test('reports an untracked file', async () => {
  fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'new\n')
  const files = await readChangedFiles(tmpDir)
  assert.ok(files.includes('untracked.txt'), `expected untracked.txt in ${JSON.stringify(files)}`)
})

test('deduplicates a file that is both staged and further modified unstaged', async () => {
  fs.writeFileSync(path.join(tmpDir, 'committed.txt'), 'v2\n')
  execSync('git add committed.txt', { cwd: tmpDir })
  fs.writeFileSync(path.join(tmpDir, 'committed.txt'), 'v3\n')
  const files = await readChangedFiles(tmpDir)
  const occurrences = files.filter((f) => f === 'committed.txt').length
  assert.equal(occurrences, 1)
})

test('HAUS_DISABLE_GIT_SIGNALS=1 short-circuits to an empty array', async () => {
  const prev = process.env.HAUS_DISABLE_GIT_SIGNALS
  process.env.HAUS_DISABLE_GIT_SIGNALS = '1'
  try {
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'new\n')
    const files = await readChangedFiles(tmpDir)
    assert.deepEqual(files, [])
  } finally {
    if (prev === undefined) delete process.env.HAUS_DISABLE_GIT_SIGNALS
    else process.env.HAUS_DISABLE_GIT_SIGNALS = prev
  }
})
```

- [ ] **Step 3: Run test to verify it fails**

  Run: `node scripts/run-tests.mjs tests/git-signal.test.js`
  Expected: FAIL on the staged and untracked cases.

- [ ] **Step 4: Fix `git-signal.ts`** — replace `src/recommender/git-signal.ts` in full:

```ts
/** Git change signal for the recommender: surfaces changed files to mark active work areas. */

import { runGit } from '../utils/exec.js'

async function runGitLines(root: string, args: string[]): Promise<string[]> {
  const result = await runGit(args, { cwd: root, timeout: 3000 })
  if (result.exitCode !== 0) return []
  return result.stdout
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * Reads changed files from git — unstaged diffs, staged diffs, and untracked files —
 * so rules touching any currently active work area become eligible, not just files
 * with unstaged edits.
 */
export async function readChangedFiles(root: string): Promise<string[]> {
  if (process.env.HAUS_DISABLE_GIT_SIGNALS === '1') return []
  try {
    const [unstaged, staged, untracked] = await Promise.all([
      runGitLines(root, ['diff', '--name-only']),
      runGitLines(root, ['diff', '--cached', '--name-only']),
      runGitLines(root, ['ls-files', '--others', '--exclude-standard']),
    ])
    return [...new Set([...unstaged, ...staged, ...untracked])].sort()
  } catch {
    return []
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/git-signal.test.js`
  Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/recommender/git-signal.ts tests/git-signal.test.js
git commit -m "fix: git change-signal includes staged and untracked files"
```

---

### Task 10: Close the catalog-ref/blob-path cache race (audit §2, L8)

**Goal:** Concurrent calls to `remoteBase()` (via `cachedCatalogRef`) and `fetchCatalogBlobPaths()` (via `cachedBlobPaths`) share one in-flight resolution instead of each independently racing to populate the cache — closing the redundant-GitHub-API-call stampede under `syncRemoteCatalog`'s 8-way concurrency.

**Files:**

- Modify: `src/catalog/remote-catalog.ts` (lines 38-39, 131-142, 359-367)
- Test: `tests/remote-catalog-tree.test.js` or `tests/remote-catalog.test.js` (extend whichever already exercises `fetchCatalogBlobPaths`/concurrency — check first)

**Acceptance Criteria:**

- [ ] Ten concurrent calls to `fetchCatalogBlobPaths` before the first resolves result in exactly one underlying `fetchGitHubRecursiveBlobPaths` network call, not ten.
- [ ] Ten concurrent calls to `remoteBase()` before `resolveCatalogRef` resolves result in exactly one underlying tag-resolution call.
- [ ] Existing `syncRemoteCatalog` behavior (result shape, per-item outcomes) is unchanged — verified by the existing `remote-catalog.test.js` suite passing unmodified.

**Verify:** `node scripts/run-tests.mjs tests/remote-catalog.test.js tests/remote-catalog-tree.test.js tests/remote-catalog-utils.test.js` → all pass, including new concurrency test.

**Steps:**

- [ ] **Step 1: Check which existing test file covers blob-path fetching**

  Run: `grep -l "fetchCatalogBlobPaths\|fetchGitHubRecursiveBlobPaths" tests/*.test.js`

- [ ] **Step 2: Write the failing test** — add to `tests/remote-catalog-tree.test.js` (or wherever Step 1 points):

```js
test('fetchCatalogBlobPaths de-duplicates concurrent calls into one network fetch', async () => {
  const prevBase = process.env.HAUS_CATALOG_REMOTE_BASE
  const prevFetch = globalThis.fetch
  delete process.env.HAUS_CATALOG_REMOTE_BASE // force the real GitHub-tree code path
  let callCount = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('/commits/')) {
      return { ok: true, json: async () => ({ commit: { tree: { sha: 'abc123' } } }) }
    }
    if (String(url).includes('/git/trees/')) {
      callCount++
      return {
        ok: true,
        json: async () => ({ tree: [{ path: 'skills/foo/SKILL.md', type: 'blob' }] }),
      }
    }
    return { ok: false }
  }
  try {
    const { fetchCatalogBlobPaths } = await import('../src/catalog/remote-catalog.js')
    const results = await Promise.all(Array.from({ length: 10 }, () => fetchCatalogBlobPaths('')))
    assert.equal(callCount, 1, `expected exactly one tree fetch, got ${callCount}`)
    for (const r of results) assert.deepEqual(r, ['skills/foo/SKILL.md'])
  } finally {
    globalThis.fetch = prevFetch
    if (prevBase === undefined) delete process.env.HAUS_CATALOG_REMOTE_BASE
    else process.env.HAUS_CATALOG_REMOTE_BASE = prevBase
  }
})
```

Note: `cachedBlobPaths`/`cachedCatalogRef` are module-level state — this test must run in a context where they start `undefined`. If other tests in the same file already exercise `fetchCatalogBlobPaths` and leave the cache populated, either reset via an exported test-only reset hook (see Step 3) or run this test first/in isolation. Add the reset hook rather than relying on test ordering.

- [ ] **Step 3: Fix the race in `remote-catalog.ts`** — replace the module-level cache declarations (lines 38-39) and the two consuming functions:

```ts
let cachedCatalogRef: string | undefined
let inFlightCatalogRef: Promise<string> | undefined
let cachedBlobPaths: string[] | undefined
let inFlightBlobPaths: Promise<string[] | null> | undefined

/** Test-only: clears all module-level catalog caches between isolated test runs. */
export function _resetRemoteCatalogCachesForTests(): void {
  cachedCatalogRef = undefined
  inFlightCatalogRef = undefined
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
}
```

In `remoteBase()` (lines 131-142), replace the ref-resolution branch:

```ts
async function remoteBase(): Promise<string> {
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    return process.env['HAUS_CATALOG_REMOTE_BASE']
  }
  if (cachedCatalogRef === undefined) {
    if (!inFlightCatalogRef) {
      inFlightCatalogRef = resolveCatalogRef({ fallbackRef: getBundledCatalogRef() }).then(
        (ref) => {
          cachedCatalogRef = ref
          return ref
        },
      )
    }
    await inFlightCatalogRef
  }
  return `${CATALOG_REPO_URL}/${cachedCatalogRef}`
}
```

In `fetchCatalogBlobPaths` (lines 360-367), replace the body:

```ts
export async function fetchCatalogBlobPaths(_base: string): Promise<string[] | null> {
  if (cachedBlobPaths) return cachedBlobPaths
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  if (!inFlightBlobPaths) {
    inFlightBlobPaths = (async () => {
      const ref = getResolvedCatalogRef()
      const paths = await fetchGitHubRecursiveBlobPaths(ref)
      if (paths) cachedBlobPaths = paths
      inFlightBlobPaths = undefined
      return paths
    })()
  }
  return inFlightBlobPaths
}
```

Note the `inFlightBlobPaths = undefined` reset inside the resolved promise — this allows a _failed_ resolution (returns `null`, doesn't populate `cachedBlobPaths`) to be retried on a subsequent call rather than permanently returning the same failed in-flight promise forever.

In `syncRemoteCatalog` (line 678), `cachedBlobPaths = undefined` already resets the per-sync cache at the start of each sync — also reset `inFlightBlobPaths = undefined` there for the same reason:

```ts
export async function syncRemoteCatalog(): Promise<SyncResult> {
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
  // ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node scripts/run-tests.mjs tests/remote-catalog-tree.test.js`
  Expected: PASS.

- [ ] **Step 5: Run the full remote-catalog suite plus the full test suite** (module-level state is easy to leak between tests)

  Run: `yarn test`
  Expected: PASS, no regressions, no test-order-dependent flakiness (run twice to be sure: `yarn test && yarn test`).

- [ ] **Step 6: Commit**

```bash
git add src/catalog/remote-catalog.ts tests/remote-catalog-tree.test.js
git commit -m "fix: memoize in-flight catalog ref/blob-path resolution to stop cache-stampede races"
```

---

### Task 11: DRY — one shared `isSafeCatalogPath` (audit §6)

**Goal:** `isSafeCatalogPath` exists in exactly one place; both `remote-catalog.ts` and `catalog/validate-core.ts` import it.

**Files:**

- Create: `src/catalog/path-safety.ts`
- Modify: `src/catalog/remote-catalog.ts:250-254` (remove local def, import instead)
- Modify: `src/catalog/validate-core.ts:29-33` (remove local def, import instead — keep the existing `export function isSafeCatalogPath` re-export there too, since other files may import it from `validate-core.ts` directly)

**Acceptance Criteria:**

- [ ] Only one implementation of the path-safety check exists in the codebase.
- [ ] `validate-core.ts` still exports `isSafeCatalogPath` (re-exported from the new module) so nothing importing it from there breaks.
- [ ] `remote-catalog.ts`'s other path-safety helpers (`isSafeRelativeFilePath`, `safeJoin`) are unaffected.
- [ ] Full test suite passes unmodified — this is a pure extraction, no behavior change.

**Verify:** `yarn test` → all pass. `grep -rn "function isSafeCatalogPath" src/` → exactly one match.

**Steps:**

- [ ] **Step 1: Check who else imports `isSafeCatalogPath`**

  Run: `grep -rln "isSafeCatalogPath" src/ tests/`

- [ ] **Step 2: Create the shared module** — `src/catalog/path-safety.ts`:

```ts
import path from 'node:path'

/** Guards against path traversal: rejects absolute paths, backslashes, and `..` segments. */
export function isSafeCatalogPath(itemPath: string): boolean {
  if (!itemPath || path.isAbsolute(itemPath) || itemPath.includes('\\')) return false
  const normalized = path.normalize(itemPath)
  return !normalized.startsWith('..') && !normalized.includes('/..')
}
```

- [ ] **Step 3: Update `remote-catalog.ts`** — remove the local `isSafeCatalogPath` definition (lines 250-254) and add to the top imports: `import { isSafeCatalogPath } from './path-safety.js'`.

- [ ] **Step 4: Update `validate-core.ts`** — replace the local definition (lines 29-33) with:

```ts
export { isSafeCatalogPath } from './path-safety.js'
```

(Placed where the old function definition was, keeping the same export surface for any existing importer of `isSafeCatalogPath` from `validate-core.ts`.)

- [ ] **Step 5: Verify no duplicate remains**

  Run: `grep -rn "function isSafeCatalogPath" src/`
  Expected: exactly one match, in `src/catalog/path-safety.ts`.

- [ ] **Step 6: Run the full suite**

  Run: `yarn test`
  Expected: PASS, no regressions (pure extraction).

- [ ] **Step 7: Commit**

```bash
git add src/catalog/path-safety.ts src/catalog/remote-catalog.ts src/catalog/validate-core.ts
git commit -m "refactor: extract isSafeCatalogPath to one shared module"
```

---

### Task 12: DRY — merge `fetchText`/`fetchBytes` shared core (audit §6)

**Goal:** The identical fetch/timeout/status-check/error-handling logic in `fetchText` and `fetchBytes` lives in one place; each becomes a thin wrapper choosing `.text()` vs `.arrayBuffer()`.

**Files:**

- Modify: `src/catalog/remote-catalog.ts:144-172`

**Acceptance Criteria:**

- [ ] `fetchText` and `fetchBytes` behave identically to before (same timeout, same warn messages, same null-on-error contract) — verified by existing tests exercising both (`remote-catalog-utils.test.js`, `remote-catalog.test.js`).
- [ ] Full test suite passes unmodified.

**Verify:** `yarn test` → all pass.

**Steps:**

- [ ] **Step 1: Replace lines 144-172 of `src/catalog/remote-catalog.ts`:**

```ts
/** Fetches a URL and hands the response to `extract`; returns null on any network, HTTP, or extraction error. Timeout: 10 s. */
async function fetchGuarded<T>(
  url: string,
  extract: (res: Response) => Promise<T>,
): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      warn(`Catalog fetch HTTP ${res.status}: ${url}`)
      return null
    }
    return await extract(res)
  } catch (e) {
    warn(`Catalog fetch failed (${e instanceof Error ? e.constructor.name : String(e)}): ${url}`)
    return null
  }
}

/** Fetches raw text from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
async function fetchText(url: string): Promise<string | null> {
  return fetchGuarded(url, (res) => res.text())
}

/** Fetches raw bytes from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
async function fetchBytes(url: string): Promise<Buffer | null> {
  return fetchGuarded(url, async (res) => Buffer.from(await res.arrayBuffer()))
}
```

- [ ] **Step 2: Run the full suite**

  Run: `yarn test`
  Expected: PASS, no regressions.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/remote-catalog.ts
git commit -m "refactor: merge fetchText/fetchBytes into one guarded fetch core"
```

---

### Task 13: DRY — collapse the 8 settings-merge rule-tier functions into one factory (audit §6)

**Goal:** `mergeDenyRules`/`mergeAllowRules`/`mergeAskRules` and their `stripHausDeny`/`stripHausAllow`/`stripHausAsk` counterparts share one implementation, parametrized by tier — so a future bug fix can't land in one tier's copy and be forgotten in another. Exported function names and signatures stay byte-identical (they're imported by `undo.ts`, `uninstall.ts`, `install/apply.ts`, `merge-project-settings.ts`).

**Files:**

- Modify: `src/install/settings-merge.ts:256-475`
- Test: `tests/settings-merge-hooks.test.js` (extend if it doesn't already cover deny/allow/ask symmetrically) plus a new `tests/settings-merge-rules.test.js` if no such coverage exists — check first.

**Acceptance Criteria:**

- [ ] `mergeDenyRules`, `mergeAllowRules`, `mergeAskRules`, `stripHausDeny`, `stripHausAllow`, `stripHausAsk` are all still exported with identical signatures and identical behavior.
- [ ] A single test suite runs the same assertions against all three tiers (deny/allow/ask) via a table, proving they're symmetric — this is the regression guard against exactly the "fixed in one copy, forgotten in the other" failure mode the refactor exists to prevent.
- [ ] `undo.ts`, `uninstall.ts`, `install/apply.ts` continue to work unmodified (no import changes needed anywhere).
- [ ] Full test suite passes.

**Verify:** `yarn test` → all pass, including the new symmetric-tier test.

**Steps:**

- [ ] **Step 1: Check existing coverage**

  Run: `grep -l "mergeDenyRules\|mergeAllowRules\|mergeAskRules\|stripHausDeny\|stripHausAllow\|stripHausAsk" tests/*.test.js`

- [ ] **Step 2: Write the symmetric-tier test** — create `tests/settings-merge-rules.test.js`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  mergeDenyRules,
  mergeAllowRules,
  mergeAskRules,
  stripHausDeny,
  stripHausAllow,
  stripHausAsk,
} from '../src/install/settings-merge.js'

const TIERS = [
  {
    name: 'deny',
    merge: mergeDenyRules,
    strip: stripHausDeny,
    permKey: 'deny',
    trackedKey: 'denyRules',
  },
  {
    name: 'allow',
    merge: mergeAllowRules,
    strip: stripHausAllow,
    permKey: 'allow',
    trackedKey: 'allowRules',
  },
  {
    name: 'ask',
    merge: mergeAskRules,
    strip: stripHausAsk,
    permKey: 'ask',
    trackedKey: 'askRules',
  },
]

for (const tier of TIERS) {
  test(`${tier.name}: merge adds new rules and tracks them`, () => {
    const { settings, addedRules } = tier.merge({}, ['rule.a', 'rule.b'])
    assert.deepEqual(settings.permissions[tier.permKey], ['rule.a', 'rule.b'])
    assert.deepEqual(addedRules, ['rule.a', 'rule.b'])
    assert.deepEqual(settings._haus[tier.trackedKey], ['rule.a', 'rule.b'])
  })

  test(`${tier.name}: merge preserves a user-authored rule not tracked by haus`, () => {
    const initial = { permissions: { [tier.permKey]: ['user.rule'] }, _haus: { hooks: [] } }
    const { settings } = tier.merge(initial, ['haus.rule'])
    assert.ok(settings.permissions[tier.permKey].includes('user.rule'))
    assert.ok(settings.permissions[tier.permKey].includes('haus.rule'))
  })

  test(`${tier.name}: merge removes a haus rule dropped from the new build list`, () => {
    const initial = {
      permissions: { [tier.permKey]: ['haus.old'] },
      _haus: { hooks: [], [tier.trackedKey]: ['haus.old'] },
    }
    const { settings } = tier.merge(initial, ['haus.new'])
    assert.equal(settings.permissions[tier.permKey].includes('haus.old'), false)
    assert.ok(settings.permissions[tier.permKey].includes('haus.new'))
  })

  test(`${tier.name}: strip removes only haus-tracked rules, preserves user rules`, () => {
    const initial = {
      permissions: { [tier.permKey]: ['user.rule', 'haus.rule'] },
      _haus: { hooks: [], [tier.trackedKey]: ['haus.rule'] },
    }
    const stripped = tier.strip(initial)
    assert.deepEqual(stripped.permissions[tier.permKey], ['user.rule'])
  })

  test(`${tier.name}: strip is a no-op when nothing is tracked`, () => {
    const initial = { permissions: { [tier.permKey]: ['user.rule'] } }
    const stripped = tier.strip(initial)
    assert.deepEqual(stripped, initial)
  })

  test(`${tier.name}: merge is idempotent`, () => {
    const first = tier.merge({}, ['rule.a', 'rule.b']).settings
    const second = tier.merge(first, ['rule.a', 'rule.b']).settings
    assert.deepEqual(first, second)
  })
}
```

- [ ] **Step 2: Run test to verify it passes against current code first** (this test should pass BEFORE the refactor too — it's a characterization test, not a red/green TDD test for new behavior)

  Run: `node scripts/run-tests.mjs tests/settings-merge-rules.test.js`
  Expected: PASS against the current 6-function implementation — this locks in current behavior before refactoring.

- [ ] **Step 3: Refactor to a factory** — replace lines 256-475 of `src/install/settings-merge.ts` (everything from the `mergeDenyRules` doc comment through the end of `stripHausAsk`) with:

```ts
type RuleTierKey = 'denyRules' | 'allowRules' | 'askRules'
type PermissionsKey = 'deny' | 'allow' | 'ask'

/**
 * Builds a merge/strip pair for one permissions tier (deny/allow/ask). All three tiers
 * share identical reconcile-then-track-then-strip logic — this factory is the single
 * place that logic lives, so a fix applies to every tier at once instead of needing to
 * be repeated (and possibly forgotten) three times.
 */
function createRuleTier(permKey: PermissionsKey, trackedKey: RuleTierKey) {
  function merge(
    settings: ClaudeSettings,
    rules: string[],
  ): { settings: ClaudeSettings; addedRules: string[] } {
    const existing = settings.permissions?.[permKey] ?? []
    const tracked = settings._haus?.[trackedKey] ?? []
    const {
      rules: nextRules,
      tracked: nextTracked,
      added,
    } = reconcileManagedRules(existing, tracked, rules)

    const updated: ClaudeSettings = { ...settings }
    updated.permissions = { ...(settings.permissions ?? {}), [permKey]: nextRules }
    updated._haus = {
      hooks: settings._haus?.hooks ?? [],
      ...(settings._haus?.hookCommands ? { hookCommands: settings._haus.hookCommands } : {}),
      ...(permKey !== 'deny' && settings._haus?.denyRules
        ? { denyRules: settings._haus.denyRules }
        : {}),
      ...(permKey !== 'allow' && settings._haus?.allowRules
        ? { allowRules: settings._haus.allowRules }
        : {}),
      ...(permKey !== 'ask' && settings._haus?.askRules
        ? { askRules: settings._haus.askRules }
        : {}),
      [trackedKey]: nextTracked,
    }

    return { settings: updated, addedRules: added }
  }

  function strip(settings: ClaudeSettings): ClaudeSettings {
    const prevHaus = settings._haus
    const ownedRules = prevHaus?.[trackedKey]
    if (!ownedRules || ownedRules.length === 0) return settings

    const ownedSet = new Set(ownedRules)
    const updated: ClaudeSettings = { ...settings }

    const remaining = (settings.permissions?.[permKey] ?? []).filter((rule) => !ownedSet.has(rule))
    const permissions: ClaudePermissions = { ...(settings.permissions ?? {}) }
    if (remaining.length > 0) permissions[permKey] = remaining
    else delete permissions[permKey]
    if (Object.keys(permissions).length > 0) updated.permissions = permissions
    else delete updated.permissions

    const haus = { ...prevHaus }
    delete haus[trackedKey]
    const stillTracking =
      (haus.hooks?.length ?? 0) > 0 ||
      (haus.hookCommands?.length ?? 0) > 0 ||
      (haus.denyRules?.length ?? 0) > 0 ||
      (haus.allowRules?.length ?? 0) > 0 ||
      (haus.askRules?.length ?? 0) > 0
    if (stillTracking) updated._haus = haus
    else delete updated._haus

    return updated
  }

  return { merge, strip }
}

const denyTier = createRuleTier('deny', 'denyRules')
const allowTier = createRuleTier('allow', 'allowRules')
const askTier = createRuleTier('ask', 'askRules')

/**
 * Reconciles haus-managed `permissions.deny` rules to exactly `rules` (the full
 * current haus deny set), preserving user-defined deny rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.denyRules`
 * for clean uninstall. Idempotent.
 */
export function mergeDenyRules(settings: ClaudeSettings, rules: string[]) {
  return denyTier.merge(settings, rules)
}

/**
 * Reconciles haus-managed `permissions.allow` rules to exactly `rules` (the full
 * current haus allow set), preserving user-defined allow rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.allowRules`
 * for clean uninstall. Idempotent.
 */
export function mergeAllowRules(settings: ClaudeSettings, rules: string[]) {
  return allowTier.merge(settings, rules)
}

/**
 * Reconciles haus-managed `permissions.ask` rules to exactly `rules` (the full
 * current haus ask set), preserving user-defined ask rules. Adds new haus rules,
 * removes haus rules no longer shipped, and tracks the result under `_haus.askRules`
 * for clean uninstall. Idempotent.
 */
export function mergeAskRules(settings: ClaudeSettings, rules: string[]) {
  return askTier.merge(settings, rules)
}

/**
 * Returns a copy of settings with haus-installed deny rules removed, leaving
 * user-defined deny rules intact. Cleans up empty containers.
 */
export function stripHausDeny(settings: ClaudeSettings): ClaudeSettings {
  return denyTier.strip(settings)
}

/**
 * Returns a copy of settings with haus-installed allow rules removed, leaving
 * user-defined allow rules intact. Cleans up empty containers.
 */
export function stripHausAllow(settings: ClaudeSettings): ClaudeSettings {
  return allowTier.strip(settings)
}

/**
 * Returns a copy of settings with haus-installed ask rules removed, leaving
 * user-defined ask rules intact. Cleans up empty containers.
 */
export function stripHausAsk(settings: ClaudeSettings): ClaudeSettings {
  return askTier.strip(settings)
}
```

`stripHausHooks` (the eighth function, lines 387-412 in the original) is deliberately left untouched — it deletes the whole `_haus` namespace rather than reconciling one tier, so it isn't part of this tier pattern; forcing it into the factory would be the "similar-looking code, different actual behavior" trap.

- [ ] **Step 4: Run the characterization test again — must still pass unchanged**

  Run: `node scripts/run-tests.mjs tests/settings-merge-rules.test.js`
  Expected: PASS, identical to Step 2's run (proves the refactor is behavior-preserving).

- [ ] **Step 5: Run the full suite**

  Run: `yarn test`
  Expected: PASS, no regressions in `settings-merge-hooks.test.js` or anywhere else that imports these six functions.

- [ ] **Step 6: Commit**

```bash
git add src/install/settings-merge.ts tests/settings-merge-rules.test.js
git commit -m "refactor: collapse deny/allow/ask rule-tier functions into one factory"
```

---

### Task 14: Refactor R1 — move `setup-core.ts` out of `src/commands/` (audit §5)

**Goal:** `setup-core.ts` is not a registered CLI command — it's shared pipeline logic that command modules import, which violates CLAUDE.md's "command modules must never import each other" rule via the `init.ts → setup-project.ts → setup-core.ts` chain. Move it to `src/claude/`, matching the precedent already set by `refresh-project.ts`.

**Files:**

- Move: `src/commands/setup-core.ts` → `src/claude/setup-core.ts`
- Modify: `src/commands/setup-project.ts:4` (update import path)
- Modify: `src/commands/workspace/setup.ts:26` (update import path)
- Verify: `src/cli.ts` has no `setup-core` registration to worry about (confirmed absent already)

**Acceptance Criteria:**

- [ ] `src/commands/setup-core.ts` no longer exists; its content lives at `src/claude/setup-core.ts` unchanged.
- [ ] `src/commands/init.ts` no longer transitively imports from another file in `src/commands/` other than `setup-project.ts` itself (which remains a legitimate command→command? — actually check: does `init.ts` importing `setup-project.ts` count as a command-module cross-import too? See note below).
- [ ] `haus setup-project` and `haus workspace setup` both still work identically (verified by their existing tests).
- [ ] Full test suite and build pass.

**Note on scope:** `init.ts` importing `runSetupProject` from `setup-project.ts` is itself a command-to-command import (both are registered CLI commands: `program.command('init')` and `program.command('setup-project')`). The audit's R1 finding specifically calls out the `setup-core.ts` link in the chain as the fixable part (since it's not a real command); `init.ts → setup-project.ts` reflects `init` intentionally delegating to `setup-project`'s full behavior (per `init.ts`'s own doc comment: "Delegates to setup-project if .haus-workflow/ does not exist"), which is a deliberate command-composition choice, not an accidental shared-helper leak. Leave that one link as-is — re-plumbing it is out of scope for this audit-driven plan (it wasn't flagged as a distinct finding) and would risk changing `init`'s current behavior for no bug-fix benefit.

**Verify:** `yarn verify` (typecheck + lint + build + test) → all pass.

**Steps:**

- [ ] **Step 1: Move the file**

```bash
git mv src/commands/setup-core.ts src/claude/setup-core.ts
```

- [ ] **Step 2: Fix `setup-core.ts`'s own relative imports** — since it moved from `src/commands/` to `src/claude/`, its imports of sibling modules change depth. Open `src/claude/setup-core.ts` and adjust:

```ts
// before (relative to src/commands/)
import { syncRemoteCatalog } from '../catalog/remote-catalog.js'
import { verifyProjectSettingsHooksContract } from '../claude/verify-hooks-contract.js'
import { writeClaudeFiles } from '../claude/write-claude-files.js'
import { recommend } from '../recommender/recommend.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { scanProject } from '../scanner/scan-project.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'

// after (relative to src/claude/)
import { syncRemoteCatalog } from '../catalog/remote-catalog.js'
import { verifyProjectSettingsHooksContract } from './verify-hooks-contract.js'
import { writeClaudeFiles } from './write-claude-files.js'
import { recommend } from '../recommender/recommend.js'
import { readContextOrScan } from '../scanner/read-context.js'
import { scanProject } from '../scanner/scan-project.js'
import { writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { displayPath, hausPath } from '../utils/paths.js'
```

- [ ] **Step 3: Update `setup-project.ts`'s import**

```ts
// src/commands/setup-project.ts:4
// before
import { runSetupCore } from './setup-core.js'
// after
import { runSetupCore } from '../claude/setup-core.js'
```

- [ ] **Step 4: Update `workspace/setup.ts`'s import**

```ts
// src/commands/workspace/setup.ts:26
// before
import { runSetupCore } from '../setup-core.js'
// after
import { runSetupCore } from '../../claude/setup-core.js'
```

- [ ] **Step 5: Grep for any other importer missed**

  Run: `grep -rn "commands/setup-core\|from '\.\./setup-core\|from '\./setup-core" src/ tests/`
  Expected: no remaining hits pointing at the old path.

- [ ] **Step 6: Run the full verification gate**

  Run: `yarn verify`
  Expected: PASS — typecheck, lint, build, and test all green.

- [ ] **Step 7: Commit**

```bash
git add -A src/commands/setup-core.ts src/claude/setup-core.ts src/commands/setup-project.ts src/commands/workspace/setup.ts
git commit -m "refactor: move setup-core.ts out of src/commands/ to break cross-command import"
```

---

### Task 15: Refactor R3 — dedupe legacy-stub-removal blocks in `write-claude-files.ts` (audit §5)

**Goal:** The three copy-pasted "read → compare against a historical stub → remove if it matches" blocks (haus-review.md, haus-doctor.md, security.md) become one parametrized helper.

**Files:**

- Modify: `src/claude/write-claude-files.ts:100-175`

**Acceptance Criteria:**

- [ ] All three legacy stubs are still removed under exactly the same conditions as before (byte-for-byte match, allowing one optional trailing LF or CRLF).
- [ ] A user-customized version of any of the three files (content differing from the historical stub) is still preserved, unremoved.
- [ ] Dry-run still logs `would remove stale ...` instead of actually removing.
- [ ] Full test suite passes unmodified (this is behavior-preserving).

**Verify:** `yarn test` → all pass, particularly any test exercising `writeClaudeFiles`'s legacy cleanup (check `grep -l "haus-review\|haus-doctor.md\|legacySecurity" tests/*.test.js` first and confirm those still pass).

**Steps:**

- [ ] **Step 1: Check existing coverage**

  Run: `grep -l "haus-review\|legacyDoctorPath\|legacySecurityPath\|removeLegacyManagedStub" tests/*.test.js`

- [ ] **Step 2: Add the shared helper** — in `src/claude/write-claude-files.ts`, above `writeClaudeFiles`:

```ts
/**
 * Removes a legacy managed stub file at `relPath` if — and only if — its content is a
 * byte-for-byte match (allowing one optional trailing LF or CRLF) for `stub`. A file that
 * differs at all is treated as user-customized and left untouched.
 */
async function removeLegacyManagedStub(
  root: string,
  relPathSegments: string[],
  stub: string,
  dryRun: boolean,
  say: (text: string) => void,
): Promise<void> {
  const target = claudePath(root, ...relPathSegments)
  if (!(await fs.pathExists(target))) return
  const content = await fs.readFile(target, 'utf8')
  if (content !== stub && content !== `${stub}\n` && content !== `${stub}\r\n`) return
  if (dryRun) {
    say(`[dry-run] would remove stale ${displayPath(root, target)}`)
  } else {
    await fs.remove(target)
  }
}
```

- [ ] **Step 3: Replace the three inline blocks** (lines 100-116, 122-133, 164-175) with calls:

```ts
await removeLegacyManagedStub(
  root,
  ['commands', 'haus-review.md'],
  'Run `haus context --task "code review"` then review diff.',
  dryRun,
  say,
)
await removeLegacyManagedStub(
  root,
  ['commands', 'haus-doctor.md'],
  'Run `haus doctor`.',
  dryRun,
  say,
)
```

Leave the `haus.md` rule-writing block (lines 134-160) exactly where it is, between the two calls above and the third — then replace the security.md block (lines 161-175) with:

```ts
await removeLegacyManagedStub(
  root,
  ['rules', 'security.md'],
  '- Never read secrets.\n- Block dangerous shell commands.',
  dryRun,
  say,
)
```

Note `claudePath(root, ...relPathSegments)` must accept a variadic segment list — check `src/utils/paths.ts`'s `claudePath` signature; if it's typed as exactly `(root: string, ...segments: string[]) => string` (matching its existing call sites like `claudePath(root, 'commands', 'haus-review.md')`), the spread call above works unchanged.

- [ ] **Step 4: Run the full suite**

  Run: `yarn test`
  Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/claude/write-claude-files.ts
git commit -m "refactor: extract removeLegacyManagedStub, dedupe three copy-pasted blocks"
```

---

### Task 16: Refactor R2 — split `remote-catalog.ts` into focused modules (audit §5)

**Goal:** The 781-line `remote-catalog.ts` — CLAUDE.md's own "highest-stakes" file — splits into modules by concern (ref resolution, HTTP fetch, path safety, GitHub tree listing, workflow template, sync), with `remote-catalog.ts` becoming a thin barrel re-exporting the exact same public API. No importer anywhere in the codebase changes.

**This task runs LAST among remote-catalog.ts changes** — it depends on Tasks 1, 10, 11, and 12 already having landed in the file, so the split carries their fixes forward instead of needing to redo them.

**Files:**

- Create: `src/catalog/remote-catalog/ref.ts`
- Create: `src/catalog/remote-catalog/http.ts`
- Create: `src/catalog/remote-catalog/github-tree.ts`
- Create: `src/catalog/remote-catalog/manifest.ts`
- Create: `src/catalog/remote-catalog/workflow-template.ts`
- Create: `src/catalog/remote-catalog/sync.ts`
- Modify: `src/catalog/remote-catalog.ts` (becomes a barrel)
- (Note: `src/catalog/path-safety.ts` already exists from Task 11 — `isSafeRelativeFilePath`/`safeJoin`/`sanitizeRelativeFilePaths` join it there too, since they're the same concern.)

**Acceptance Criteria:**

- [ ] Every name currently exported from `src/catalog/remote-catalog.ts` is still importable from `src/catalog/remote-catalog.js` with an identical signature — zero importer elsewhere in the codebase needs to change.
- [ ] `grep -c "^export" src/catalog/remote-catalog.ts` before and after matches the barrel's re-export count (nothing silently dropped).
- [ ] Full test suite passes unmodified — this is a pure structural move.
- [ ] `yarn build` succeeds (no circular-import issues introduced by the split).

**Verify:** `yarn verify` → all pass.

**Steps:**

- [ ] **Step 1: List the current public export surface** (to check against at the end)

  Run: `grep "^export" src/catalog/remote-catalog.ts`

  Expected list: `getCacheDir`, `getBundledCatalogRef`, `getResolvedCatalogRef`, `isCatalogRefResolved`, `resolveCatalogRef`, `fetchRemoteManifest`, `WORKFLOW_TEMPLATE_REL`, `readWorkflowTemplate`, `SyncResult` (type), `fetchCatalogBlobPaths`, `listFilesUnderCatalogPrefix`, `syncRemoteCatalog`, `fetchLatestCatalogTag`, `getCacheManifestAge`, `_resetRemoteCatalogCachesForTests` (added in Task 10).

- [ ] **Step 2: Move path-safety helpers into `path-safety.ts`** (the file created in Task 11) — add `isSafeRelativeFilePath`, `safeJoin`, `sanitizeRelativeFilePaths` there too:

```ts
// append to src/catalog/path-safety.ts

/** Guards relative file paths from tree listings (untrusted) before joining under a dest dir. */
export function isSafeRelativeFilePath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('//')) return false
  if (path.isAbsolute(rel)) return false
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'))
  return normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../')
}

/** Resolves itemPath under base; returns null if the result escapes the base directory. */
export function safeJoin(base: string, itemPath: string): string | null {
  if (!isSafeCatalogPath(itemPath)) return null
  const resolved = path.resolve(base, itemPath)
  return resolved.startsWith(base + path.sep) || resolved === base ? resolved : null
}
```

`sanitizeRelativeFilePaths` needs a `warn` import — since `path-safety.ts` should stay dependency-light, keep `sanitizeRelativeFilePaths` in `github-tree.ts` instead (it's only used there) rather than moving it here; only `isSafeRelativeFilePath` and `safeJoin` move to `path-safety.ts`.

- [ ] **Step 3: Create `src/catalog/remote-catalog/ref.ts`** — catalog-ref resolution and semver tag comparison:

```ts
/** Resolves which catalog git ref (tag or branch) to fetch from, and caches it per-process. */
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'
import { packageRoot } from '../../utils/paths.js'
import { CATALOG_CACHE_SUBDIR, CATALOG_REPO_URL } from '../constants.js'

/** True when running under test mode — only then is HAUS_CATALOG_REMOTE_BASE honoured. */
export function isTestMode(): boolean {
  return process.env['HAUS_TEST_MODE'] === '1' || process.env['NODE_ENV'] === 'test'
}

/** Resolves the catalog cache directory (per call so tests can override env after import). */
export function getCacheDir(): string {
  return (
    process.env['HAUS_CATALOG_CACHE_DIR_OVERRIDE'] ?? path.join(os.homedir(), CATALOG_CACHE_SUBDIR)
  )
}

let cachedCatalogRef: string | undefined
let inFlightCatalogRef: Promise<string> | undefined

/** Returns the version tag from the bundled catalog snapshot (e.g. "v3.2.0"). */
export function getBundledCatalogRef(): string | undefined {
  try {
    const manifestPath = path.join(packageRoot(), 'library/catalog/manifest.json')
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const data = JSON.parse(raw) as { version?: string }
    if (typeof data.version === 'string' && data.version) {
      return data.version.startsWith('v') ? data.version : `v${data.version}`
    }
  } catch {
    // bundled manifest unreadable — caller handles undefined
  }
  return undefined
}

/** Latest resolved catalog ref for this process (informational / lock metadata). */
export function getResolvedCatalogRef(): string {
  const resolved = cachedCatalogRef ?? process.env['HAUS_CATALOG_REF'] ?? getBundledCatalogRef()
  if (!resolved) {
    warn(
      'Could not determine catalog ref from cache, env, or bundled snapshot — falling back to main (moving target).',
    )
    return 'main'
  }
  return resolved
}

/** True after sync or when HAUS_CATALOG_REF is set (not the unsynced `main` fallback). */
export function isCatalogRefResolved(): boolean {
  return cachedCatalogRef !== undefined || process.env['HAUS_CATALOG_REF'] !== undefined
}

const CATALOG_TAGS_API_URL = 'https://api.github.com/repos/WeAreHausTech/haus-workflow-catalog/tags'

function parseSemverTag(tag: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** Returns auth headers for the GitHub API, if a token is configured. */
export function githubApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const auth = process.env['HAUS_GITHUB_TOKEN'] ?? process.env['GITHUB_TOKEN']
  if (auth) headers['Authorization'] = `Bearer ${auth}`
  return headers
}

/**
 * Fetches the latest release tag from the catalog GitHub repo.
 * Returns null if the request fails or no tags exist. Timeout: 5 seconds. Does not throw.
 */
export async function fetchLatestCatalogTag(): Promise<string | null> {
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  try {
    const res = await fetch(CATALOG_TAGS_API_URL, {
      signal: AbortSignal.timeout(5_000),
      headers: githubApiHeaders(),
    })
    if (!res.ok) return null
    const tags = (await res.json()) as Array<{ name?: string }>
    const valid = tags
      .map((tag) => {
        const name = typeof tag.name === 'string' ? tag.name : ''
        const semver = parseSemverTag(name)
        return semver ? { name, semver } : null
      })
      .filter(
        (entry): entry is { name: string; semver: [number, number, number] } => entry !== null,
      )
    if (valid.length === 0) return null
    valid.sort((a, b) => compareSemver(b.semver, a.semver))
    return valid[0]!.name
  } catch {
    return null
  }
}

/**
 * Resolve which git ref to fetch the catalog from.
 * Honors HAUS_CATALOG_REF (warns when set to 'main' — it is a moving target).
 * Otherwise uses the latest release tag from GitHub.
 * When tag resolution fails, falls back to `fallbackRef`, then the bundled snapshot ref,
 * then 'main' as an absolute last resort.
 */
export async function resolveCatalogRef(opts?: {
  env?: NodeJS.ProcessEnv
  fetchLatestTag?: () => Promise<string | null>
  fallbackRef?: string
}): Promise<string> {
  const env = opts?.env ?? process.env
  if (env['HAUS_CATALOG_REF']) {
    if (env['HAUS_CATALOG_REF'] === 'main') {
      warn(
        'HAUS_CATALOG_REF=main is set — fetching from the moving main branch. ' +
          'Pin to a release tag for reproducible installs.',
      )
    }
    return env['HAUS_CATALOG_REF']
  }
  const fetchLatest = opts?.fetchLatestTag ?? fetchLatestCatalogTag
  const tag = await fetchLatest()
  if (tag !== null) return tag
  const fallback = opts?.fallbackRef
  if (fallback) {
    warn(
      `Tag resolution failed — using cached ref ${fallback}. ` +
        'To use latest, retry or set HAUS_CATALOG_REF explicitly.',
    )
    return fallback
  }
  const bundled = getBundledCatalogRef()
  if (bundled) {
    warn(
      `Tag resolution failed — using bundled snapshot ref ${bundled}. ` +
        'To use latest, retry or set HAUS_CATALOG_REF explicitly.',
    )
    return bundled
  }
  warn(
    'Tag resolution failed and no fallback ref is available. ' +
      'Set HAUS_CATALOG_REF explicitly to avoid fetching from main.',
  )
  return 'main'
}

/** Resolves the base URL to fetch catalog content from (honors HAUS_CATALOG_REMOTE_BASE in test mode). */
export async function remoteBase(): Promise<string> {
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    return process.env['HAUS_CATALOG_REMOTE_BASE']
  }
  if (cachedCatalogRef === undefined) {
    if (!inFlightCatalogRef) {
      inFlightCatalogRef = resolveCatalogRef({ fallbackRef: getBundledCatalogRef() }).then(
        (ref) => {
          cachedCatalogRef = ref
          return ref
        },
      )
    }
    await inFlightCatalogRef
  }
  return `${CATALOG_REPO_URL}/${cachedCatalogRef}`
}

/** Test-only: clears the module-level ref cache between isolated test runs. */
export function _resetRefCacheForTests(): void {
  cachedCatalogRef = undefined
  inFlightCatalogRef = undefined
}
```

- [ ] **Step 4: Create `src/catalog/remote-catalog/http.ts`** — the guarded fetch core plus the cache-write helper:

```ts
/** Guarded HTTP fetch helpers shared by every catalog content fetcher. */
import path from 'node:path'

import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'

/** Fetches a URL and hands the response to `extract`; returns null on any network, HTTP, or extraction error. Timeout: 10 s. */
async function fetchGuarded<T>(
  url: string,
  extract: (res: Response) => Promise<T>,
): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      warn(`Catalog fetch HTTP ${res.status}: ${url}`)
      return null
    }
    return await extract(res)
  } catch (e) {
    warn(`Catalog fetch failed (${e instanceof Error ? e.constructor.name : String(e)}): ${url}`)
    return null
  }
}

/** Fetches raw text from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
export async function fetchText(url: string): Promise<string | null> {
  return fetchGuarded(url, (res) => res.text())
}

/** Fetches raw bytes from a URL; returns null on any network or HTTP error. Timeout: 10 s. */
export async function fetchBytes(url: string): Promise<Buffer | null> {
  return fetchGuarded(url, async (res) => Buffer.from(await res.arrayBuffer()))
}

export type WriteOutcome = 'created' | 'updated' | 'unchanged'

/** Writes `text` to `dest` when missing or content differs; creates parent dirs on write. */
export async function writeTextIfChanged(dest: string, text: string): Promise<WriteOutcome> {
  if (await fs.pathExists(dest)) {
    const local = await fs.readFile(dest, 'utf8')
    if (local === text) return 'unchanged'
    await fs.writeFile(dest, text, 'utf8')
    return 'updated'
  }
  await fs.ensureDir(path.dirname(dest))
  await fs.writeFile(dest, text, 'utf8')
  return 'created'
}
```

- [ ] **Step 5: Create `src/catalog/remote-catalog/github-tree.ts`** — blob-path listing:

```ts
/** GitHub tree-listing helpers: resolves which files exist under a catalog prefix. */
import fs from 'fs-extra'

import { warn } from '../../utils/logger.js'
import { isSafeRelativeFilePath } from '../path-safety.js'
import { CATALOG_GITHUB_API_URL } from '../constants.js'

import { fetchText } from './http.js'
import { getResolvedCatalogRef, githubApiHeaders, isTestMode } from './ref.js'

let cachedBlobPaths: string[] | undefined
let inFlightBlobPaths: Promise<string[] | null> | undefined

/** Drop unsafe entries; returns null when any path in the listing is rejected. */
function sanitizeRelativeFilePaths(files: string[], label: string): string[] | null {
  const safe: string[] = []
  for (const rel of files) {
    if (!isSafeRelativeFilePath(rel)) {
      warn(`Rejected unsafe path in ${label}: ${rel}`)
      return null
    }
    safe.push(rel)
  }
  return safe
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    if (!(await fs.pathExists(dir))) return out
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)))
    } else if (entry.isFile()) {
      out.push(full.slice(base.length + 1).replace(/\\/g, '/'))
    }
  }
  return out.sort()
}

/** Mock test hook: GET {base}/__haus_tree__/{prefix} → JSON string[] of paths relative to prefix. */
async function listMockPrefixFiles(base: string, prefix: string): Promise<string[] | null> {
  const text = await fetchText(`${base}/__haus_tree__/${encodeURIComponent(prefix)}`)
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!Array.isArray(parsed) || !parsed.every((e) => typeof e === 'string')) return null
    return parsed as string[]
  } catch {
    return null
  }
}

async function fetchGitHubRecursiveBlobPaths(ref: string): Promise<string[] | null> {
  try {
    const headers = githubApiHeaders()
    const commitRes = await fetch(`${CATALOG_GITHUB_API_URL}/commits/${encodeURIComponent(ref)}`, {
      signal: AbortSignal.timeout(15_000),
      headers,
    })
    if (!commitRes.ok) return null
    const commit = (await commitRes.json()) as { commit: { tree: { sha: string } } }
    const treeSha = commit.commit.tree.sha
    const treeRes = await fetch(`${CATALOG_GITHUB_API_URL}/git/trees/${treeSha}?recursive=1`, {
      signal: AbortSignal.timeout(30_000),
      headers,
    })
    if (!treeRes.ok) return null
    const tree = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string }>
      truncated?: boolean
    }
    if (tree.truncated) {
      warn('Catalog GitHub tree listing was truncated — refusing partial cache sync')
      return null
    }
    return tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)
  } catch {
    return null
  }
}

/** All blob paths in the catalog repo at the resolved ref (cached per sync). */
export async function fetchCatalogBlobPaths(_base: string): Promise<string[] | null> {
  if (cachedBlobPaths) return cachedBlobPaths
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) return null
  if (!inFlightBlobPaths) {
    inFlightBlobPaths = (async () => {
      const ref = getResolvedCatalogRef()
      const paths = await fetchGitHubRecursiveBlobPaths(ref)
      if (paths) cachedBlobPaths = paths
      inFlightBlobPaths = undefined
      return paths
    })()
  }
  return inFlightBlobPaths
}

/** File paths relative to `prefix` (e.g. SKILL.md, references/foo.md). */
export async function listFilesUnderCatalogPrefix(
  prefix: string,
  base: string,
): Promise<string[] | null> {
  const normalized = prefix.replace(/\\/g, '/').replace(/\/+$/, '')
  const prefixSlash = `${normalized}/`

  let relFiles: string[] | null
  if (isTestMode() && process.env['HAUS_CATALOG_REMOTE_BASE']) {
    relFiles = await listMockPrefixFiles(base, normalized)
  } else {
    const blobs = await fetchCatalogBlobPaths(base)
    if (!blobs) return null
    relFiles = blobs
      .filter((p) => p.startsWith(prefixSlash))
      .map((p) => p.slice(prefixSlash.length))
      .sort()
  }
  if (!relFiles) return null
  return sanitizeRelativeFilePaths(relFiles, normalized)
}

/** Test-only: clears the module-level blob-path cache between isolated test runs. */
export function _resetBlobPathCacheForTests(): void {
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
}

/** Resets the per-sync blob-path cache at the start of a fresh `syncRemoteCatalog` run. */
export function _resetBlobPathCacheForNewSync(): void {
  cachedBlobPaths = undefined
  inFlightBlobPaths = undefined
}

export { listFilesRecursive }
```

- [ ] **Step 6: Create `src/catalog/remote-catalog/manifest.ts`**:

```ts
/** Fetches and schema-validates the remote catalog manifest. */
import type { CatalogItem } from '../../types.js'
import { parseManifest } from '../manifest-schema.js'

import { fetchText } from './http.js'
import { remoteBase } from './ref.js'
import { warn } from '../../utils/logger.js'

/** Downloads and schema-validates the remote manifest; returns null if fetch or validation fails. */
export async function fetchRemoteManifest(): Promise<{
  version: string
  items: CatalogItem[]
} | null> {
  const base = await remoteBase()
  const text = await fetchText(`${base}/manifest.json`)
  if (!text) return null
  const parsed = parseManifest(text)
  if (!parsed.ok) {
    warn(`Remote manifest failed schema validation: ${parsed.error}`)
    return null
  }
  if (!parsed.manifest.items.length) return null
  return parsed.manifest
}
```

- [ ] **Step 7: Create `src/catalog/remote-catalog/workflow-template.ts`**:

```ts
/** Resolves the workflow standard template, cache-first with fetch-on-demand fallback. */
import path from 'node:path'

import fs from 'fs-extra'

import { fetchText } from './http.js'
import { getCacheDir, remoteBase } from './ref.js'
import { writeTextIfChanged } from './http.js'

/** Relative path of the workflow standard template within the catalog. */
export const WORKFLOW_TEMPLATE_REL = 'templates/agentic-workflow-standard.md'

/**
 * Resolves the workflow standard template content, using the cache when present and
 * otherwise fetching it from the remote catalog on demand. Returns the content, or null
 * when it cannot be obtained. In dry-run mode, a freshly fetched template is always
 * returned but never written to the cache (no filesystem side effects during a preview).
 */
export async function readWorkflowTemplate(
  opts: { dryRun?: boolean } = {},
): Promise<string | null> {
  const dest = path.join(getCacheDir(), WORKFLOW_TEMPLATE_REL)
  const base = await remoteBase()
  const text = await fetchText(`${base}/${WORKFLOW_TEMPLATE_REL}`)
  if (text === null) {
    if (await fs.pathExists(dest)) return fs.readFile(dest, 'utf8')
    return null
  }
  if (!opts.dryRun) {
    await writeTextIfChanged(dest, text)
  }
  return text
}
```

- [ ] **Step 8: Create `src/catalog/remote-catalog/sync.ts`** — the largest remaining piece: `syncRemoteCatalog` and everything it calls (`syncOneItem`, `syncSkillDirectory`, `syncConfigItem`, `syncSuperpowersShared`, `syncDirectoryFromPrefix`, `fetchPrefixFiles`, `validateMarkdownFiles`, `directoryMatchesFetched`, `writeFetchedDirectory`, plus `getCacheManifestAge`). Move these functions verbatim from the current `remote-catalog.ts` (lines 191-247, 359 comment, 392-724, 773-781), updating only their imports to pull from the new module locations:

```ts
/** Syncs the remote catalog manifest and item content into the local cache. */
import path from 'node:path'

import fs from 'fs-extra'

import type { CatalogItem } from '../../types.js'
import { mapWithConcurrency } from '../../utils/fs.js'
import { warn } from '../../utils/logger.js'
import { validateCatalogItem } from '../ingest-catalog.js'
import { isSafeCatalogPath, safeJoin } from '../path-safety.js'
import { SUPERPOWERS_SHARED_CATALOG_REL } from '../constants.js'

import { fetchBytes, fetchText, writeTextIfChanged } from './http.js'
import {
  listFilesRecursive,
  listFilesUnderCatalogPrefix,
  _resetBlobPathCacheForNewSync,
} from './github-tree.js'
import { fetchRemoteManifest } from './manifest.js'
import { getCacheDir, remoteBase } from './ref.js'

// [paste syncDirectoryFromPrefix, syncSkillDirectory, syncConfigItem, syncSuperpowersShared,
//  syncOneItem, syncRemoteCatalog, fetchPrefixFiles, validateMarkdownFiles,
//  directoryMatchesFetched, writeFetchedDirectory, FetchedFile type, KNOWN_ITEM_TYPES,
//  isMarkdownPath, SyncResult type, getCacheManifestAge — verbatim from the current file,
//  replacing the `cachedBlobPaths = undefined` line at the top of syncRemoteCatalog with
//  a call to `_resetBlobPathCacheForNewSync()` ]
```

This step is a verbatim move, not a rewrite — copy the exact bodies of these functions from the current `remote-catalog.ts` (as read in this plan's research phase) into `sync.ts`, changing only import paths. Do not alter their logic.

- [ ] **Step 9: Reduce `remote-catalog.ts` to a barrel:**

```ts
/**
 * Public API for the remote haus-workflow-catalog integration. Re-exports from the
 * split modules under `remote-catalog/` — see that directory for implementation.
 * This file's export surface must stay identical to what it was before the split
 * (audit R2): every existing importer in the codebase keeps working unchanged.
 */
export {
  getCacheDir,
  getBundledCatalogRef,
  getResolvedCatalogRef,
  isCatalogRefResolved,
  resolveCatalogRef,
  _resetRefCacheForTests as _resetRemoteCatalogCachesForTests,
} from './remote-catalog/ref.js'
export { fetchLatestCatalogTag } from './remote-catalog/ref.js'
export { fetchRemoteManifest } from './remote-catalog/manifest.js'
export { WORKFLOW_TEMPLATE_REL, readWorkflowTemplate } from './remote-catalog/workflow-template.js'
export { fetchCatalogBlobPaths, listFilesUnderCatalogPrefix } from './remote-catalog/github-tree.js'
export { syncRemoteCatalog, getCacheManifestAge, type SyncResult } from './remote-catalog/sync.js'
```

If Task 10's `_resetRemoteCatalogCachesForTests` needs to reset BOTH the ref cache and the blob-path cache (it did, pre-split), change its barrel export to a small local wrapper instead of a direct re-export:

```ts
import { _resetRefCacheForTests } from './remote-catalog/ref.js'
import { _resetBlobPathCacheForTests } from './remote-catalog/github-tree.js'

/** Test-only: clears all module-level catalog caches between isolated test runs. */
export function _resetRemoteCatalogCachesForTests(): void {
  _resetRefCacheForTests()
  _resetBlobPathCacheForTests()
}
```

Use this wrapper form, not a direct re-export, since it must reset two now-separate module caches.

- [ ] **Step 10: Verify the export surface is unchanged**

  Run: `grep "^export" src/catalog/remote-catalog.ts`
  Compare against Step 1's list — every name must still appear (directly or via the barrel).

- [ ] **Step 11: Run the full verification gate**

  Run: `yarn verify`
  Expected: PASS — typecheck (no circular-import errors), lint, build, and test all green.

- [ ] **Step 12: Run the test suite twice** (module-level cache state across split files is exactly the kind of thing that can leak between test files in a new way)

  Run: `yarn test && yarn test`
  Expected: PASS both times, consistently.

- [ ] **Step 13: Commit**

```bash
git add -A src/catalog/remote-catalog.ts src/catalog/remote-catalog/ src/catalog/path-safety.ts
git commit -m "refactor: split remote-catalog.ts into focused modules behind a stable barrel"
```

---

### Task 17: Update the audit artifact to reflect fixed status

**Goal:** The published audit report (this conversation's artifact, source file `haus-audit-report.html`) shows which of sections 1/2/5/6's findings were fixed by this plan, so the report doesn't silently go stale the moment the code changes.

**Files:**

- Modify: `/private/tmp/claude-501/-Users-aniisa-Documents-GitHub-haus-workflow/7ea5e004-ffa7-4009-b035-fbe3f5677350/scratchpad/haus-audit-report.html`

**Depends on:** All of Tasks 1-16 committed and `yarn verify` green on the branch.

**Acceptance Criteria:**

- [ ] Every finding in sections 1, 2, 5, 6 that this plan addressed has a visible "Fixed" status marker (not silently deleted — the report stays a historical record of what was found, plus current status).
- [ ] The report's footer notes the date/commit range this remediation pass covered.
- [ ] The artifact is republished to the SAME URL (same `file_path`, per the Artifact tool's update contract) — not a new one.
- [ ] Section 9 ("five features") is left untouched — it's out of scope for this plan.

**Steps:**

- [ ] **Step 1: Add a `.fixed` status style and a "Fixed" tag class** to the `<style>` block in the HTML, near the existing `.tag` rules:

```css
.tag.fixed {
  color: var(--green);
  background: var(--green-soft);
  text-decoration: none;
}
.finding.is-fixed .lead {
  text-decoration: line-through;
  text-decoration-color: var(--ink-soft);
  text-decoration-thickness: 1px;
}
.finding.is-fixed p:not(.lead) {
  opacity: 0.75;
}
```

- [ ] **Step 2: For each of the two `.finding` blocks in the CLI section (B1, B2)**, add `class="finding is-fixed"` and insert a `<span class="tag fixed">FIXED</span>` alongside the existing `CONFIRMED` tag, e.g.:

```html
<div class="finding is-fixed">
  <span class="tag b1">CONFIRMED</span><span class="tag fixed">FIXED</span> ...
</div>
```

- [ ] **Step 3: For each `<li>` item in the "Possible bugs" (L1-L8), "Refactor" (R1-R3), and "DRY & optimization" lists in the CLI section**, prepend a bold `[Fixed]` marker to the `<b>` lead text, e.g. `<b>[Fixed] Bash guard is a naive substring match...</b>` — do this for all 8 possible-bug items, both refactor callouts/items, and all four DRY items covered by Tasks 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 (i.e. every item in those three lists — this plan covers all of them).

- [ ] **Step 4: Update the footer** — append a line to `<footer class="end">`:

```html
<p>
  Remediation pass (2026-08-03): sections 1, 2, 5, and 6 above were addressed — see
  <code>docs/plans/cli-audit-remediation.md</code> and branch
  <code>fix/cli-audit-remediation</code> in haus-workflow. Sections 3, 4, 7, 8, and 9 remain open.
</p>
```

Replace the date with the actual date this task is executed, and confirm the branch name matches what was actually used.

- [ ] **Step 5: Republish** — use the Artifact tool with the SAME `file_path` as the original publish (`/private/tmp/claude-501/-Users-aniisa-Documents-GitHub-haus-workflow/7ea5e004-ffa7-4009-b035-fbe3f5677350/scratchpad/haus-audit-report.html`) and the SAME `favicon` (🔎) — this updates the existing artifact URL rather than minting a new one. If this plan is executed in a different session/conversation where that exact scratchpad path no longer exists, instead pass the artifact's existing URL via the `url` parameter (find it with `action: "list"` if not already known) so the update still lands on the same published page rather than creating a duplicate.

- [ ] **Step 6: Confirm the update** — re-fetch or re-render the artifact and visually confirm the FIXED markers and footer note appear correctly in both light and dark theme (the existing `--green`/`--green-soft` tokens are already theme-aware, so no new CSS variables are needed).

---

## Post-plan: finishing the branch

Per `.haus-workflow/WORKFLOW.md` step 6 — before merging, do a code review (adversarial, fresh context) and present merge/PR/cleanup options. Use the **requesting-code-review** skill, then the **finishing-a-development-branch** skill, rather than merging directly.
