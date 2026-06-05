# Plan: Tier-1 test coverage — CLI, workflow, Claude Code integration

## Context

The package already has a strong test base (258 tests, c8 ratchet, 4 CI workflows,
contract-drift, CLI smoke). But three real-world failure modes ship uncaught today:

1. **The packaged artifact is never exercised.** CI runs `dist/cli.js` directly and runs
   `yarn pack`, but never installs the _packed tarball_ into a clean dir and runs `haus`. A
   missing `files` entry, broken bin shebang, ESM resolution failure, or unbundled prod
   dependency (`--external @inquirer/checkbox`) would reach users undetected.
2. **The Claude Code hook I/O contract — the actual "works in Claude Code desktop" boundary
   — is thinly tested.** Desktop spawns `haus guard …`/`haus context …`, pipes a hook JSON on
   stdin, and reads a JSON decision on stdout + an exit code. Today `tests/guard.test.js`
   only tests the pure `guardBash`/`guardFileAccess` reason strings; nothing exercises
   `runGuard` in `src/commands/guard.ts` (stdin → `{"permissionDecision":"deny",…}` →
   `exitCode 1`). A renamed JSON key or dropped exit code would silently disable enforcement
   inside Claude Code with zero test failure.
3. **No full install↔uninstall round-trip.** Unit tests cover merge/strip in isolation, but
   nothing asserts that after install→uninstall against a temp HOME, `settings.json` is
   restored exactly and user entries survive — and that install-twice produces no duplicate
   hooks. Stripping the wrong entry corrupts a user's real `~/.claude`.

**Reality check (cannot be tested):** Claude Code desktop cannot be driven headlessly. The
faithful proxy is the hook I/O contract test (exact stdin payload → exact stdout/exit
assertions) — not GUI automation. This plan tests the contract on our side of the boundary.

Scope: **Tier 1 only**, delivered in **one feature branch** (`feat/test-tier1`).

---

## Execution checklist

Work the tasks in order. Each box is a verifiable signal — do not check it until the named
command passes.

- [ ] **Prereq** — add `runHausRaw` to `tests/helpers/fixture-runner.js`. Signal: imports cleanly, `yarn test` still green.
- [ ] **Task 1** — `tests/guard-hook-contract.test.js` with all 6 cases. Signal: `yarn test` green; manual spot-check (below) matches.
- [ ] **Task 2** — `pack-smoke` job in `.github/workflows/ci.yml` (+ optional `scripts/pack-smoke.mjs`). Signal: job green on pushed branch; deliberately removing a `files` entry turns it red.
- [ ] **Task 3** — `tests/install-roundtrip.test.js` (hooks-merged + preservation + idempotency + round-trip restore). Signal: `yarn test` green.
- [ ] **Gate** — `yarn verify` passes end-to-end (typecheck + typecheck:scripts + lint + build + test).
- [ ] **Coverage** — `yarn coverage:check` does not regress the ratchet floor.
- [ ] **Review** — adversarial code review (fresh context) before merge.
- [ ] **Merge** — squash-merge to `main`, delete branch (`gh pr merge <n> --squash --delete-branch`).

---

## Prerequisite: enabling helper

`tests/helpers/fixture-runner.js` `runHaus` uses `execaSync` with defaults → it **throws on
nonzero exit and returns only stdout**. The entire guard deny path (exitCode 1 + stdout JSON)
is untestable through it.

**Add a sibling helper** (do not change `runHaus` — avoids churn across 50 files):

```js
// tests/helpers/fixture-runner.js
export function runHausRaw(cwd, args, { input } = {}) {
  return execaSync('node', [cliPath(), ...args], { cwd, input, reject: false })
  // returns { stdout, stderr, exitCode }
}
```

Reuse the existing `cliPath()` already in that file. Runs against `dist/cli.js` so it tests
the shipped binary.

---

## Task 1 — Guard hook I/O contract test

**Source doc:** gap #2 above. **File:** `tests/guard-hook-contract.test.js` (new).
**Reuses:** `runHausRaw` (Task prerequisite), `src/commands/guard.ts` contract.

Drive `dist/cli.js guard …  --from-hook` with stdin payloads matching what Claude Code sends.

Acceptance criteria (one test case each):

- `guard bash` + `{tool_input:{command:'rm -rf /'}}` → `exitCode===1`; `JSON.parse(stdout)`
  has `permissionDecision==='deny'` and non-empty `permissionDecisionReason`; reason contains
  no backticks (mirrors existing guard.test.js regression).
- `guard bash` + `{tool_input:{command:'yarn test'}}` → `exitCode===0`, `stdout.trim()===''`
  (allow = emit nothing).
- `guard file-access` + `{tool_input:{file_path:'.env'}}` → deny + exit 1.
- `guard file-access` + `{tool_input:{path:'config/app.pem'}}` → deny (tests the `path ??
file_path` alias in guard.ts:45).
- malformed stdin `'{not json'` → deny, reason `Malformed hook payload`, exit 1.
- empty stdin `''` → allow, exit 0 (guard.ts treats empty as `{}`).

**Verification:** `yarn test` (new file passes). **Runs:** local + existing CI Test step.
**Cost:** none — ~6 subprocess spawns, deterministic, no network.

---

## Task 2 — Packed-tarball clean-install smoke

**Source doc:** gap #1 above. **Files:** new `pack-smoke` job in
`.github/workflows/ci.yml`; optional `scripts/pack-smoke.mjs` for local parity.

Steps:

1. `yarn build` then `yarn pack --out /tmp/haus.tgz`.
2. `mkdir /tmp/consumer && cd /tmp/consumer && npm init -y && npm install /tmp/haus.tgz`
   (clean dir with real `node_modules` — forces `@inquirer/checkbox` + prod deps to resolve).
3. `node node_modules/.bin/haus --version` (asserts shebang + bin mapping), then
   `node node_modules/@haus-tech/haus-workflow/dist/cli.js scan --json` in a throwaway project
   (reuse the package.json + yarn.lock fixture the existing "CLI smoke checks" step builds).
4. Assert each `files` allowlist path resolves inside the installed package:
   `library/global`, `library/catalog`, `tests/fixtures/catalog`, `scripts/postinstall.mjs`,
   `dist/cli.js` (one `fs.accessSync` per path → missing-`files`-entry becomes a red build).
5. Set `HAUS_NO_POSTINSTALL=1` so the tarball install does not touch `~/.claude`.

Acceptance criteria: job is green only when the installed tarball runs `--version` + `scan`
and every shipped path resolves.

**Verification:** push branch, observe `pack-smoke` job green. **Runs:** new CI job (parallel
to `build`). **Cost:** `npm install` of tarball pulls prod deps → **network**, ~20–40s, mild
registry-flake risk. Mitigate: `npm install --prefer-offline` + setup-node cache. Separate job
so a registry hiccup never masks unit-test failures.

---

## Task 3 — Install → uninstall round-trip + idempotency + preservation

**Source doc:** gap #3 above. **File:** `tests/install-roundtrip.test.js` (new).
**Reuses:** temp-HOME `beforeEach`/`afterEach` pattern from `tests/install.test.js` (stub
`process.env.HOME`/`USERPROFILE` to a `mkdtempSync` dir). Import `applyInstall` from
`../src/install/apply.js` and `runUninstall` from `../src/install/uninstall.js` (verified
import paths — `src/commands/uninstall.ts` exports `runUninstallCommand`, NOT the one we want).

**What is NOT new coverage (avoid re-testing):** `install.test.js` already covers deny-rule
install+strip, allow-rule install+strip, seeded-command install+strip, and dry-run — all via
`applyInstall`/`runUninstall`. This task fills the remaining gaps it does _not_ cover.

**Verified facts** (apply.ts:215-218, uninstall.ts:83, library/global/settings-fragments/hooks.json):

- `applyInstall` reads existing settings, then `mergeHooks` + `mergeDenyRules` +
  `mergeAllowRules`, then writes — so pre-seeded user settings are preserved through merge.
- The fragment has 3 hooks: `hook.guard.file-access` (keep, PreToolUse, matcher
  `Read|Edit|Write`) and `hook.guard.bash` (keep, PreToolUse, matcher `Bash`) both merge;
  `hook.context` (gate-default-off, UserPromptSubmit) does **not**. So after install:
  **2 keep hooks land under `PreToolUse`, context absent.**
- `install.test.js` never asserts `settings.hooks` after `applyInstall` — hook merge at the
  integration level is currently untested. This task covers it.

Acceptance criteria:

- **Hooks merged (new integration coverage):** after `applyInstall({})`, `settings.hooks
.PreToolUse` contains the 2 keep hooks (commands `haus guard file-access --from-hook`,
  `haus guard bash --from-hook`); no `UserPromptSubmit` entry for the gated `hook.context`;
  `_haus.hooks`/`_haus.hookCommands` populated.
- **Preservation:** seed `~/.claude/settings.json` (= `tmpDir/.claude/settings.json`) with
  user content _before_ install — a user `PreToolUse` hook
  (`{matcher:'Bash',hooks:[{type:'command',command:'my-own-linter'}]}`), a user
  `permissions.deny` entry, a user `permissions.allow` entry, a top-level `model` key. Snapshot
  it. After `applyInstall({})`: user hook + deny + allow + `model` all still present alongside
  the haus entries.
- **Idempotency:** run `applyInstall({})` a second time → `PreToolUse` length unchanged,
  `_haus.hooks` no duplicates, deny/allow arrays unchanged.
- **Round-trip restore:** `runUninstall({force:true})` → `settings.json` deep-equals the
  pre-install snapshot (user hook/deny/allow/`model` intact, `_haus` gone, no haus command
  strings remain). Load-bearing: `stripHausHooks` matches on `_haus.hookCommands` exactly, so
  this catches command-string drift between the global fragment and the strip logic.

**Verification:** `yarn test`. **Runs:** local + CI Test step. **Cost:** none — pure temp-fs,
no network, no subprocess.

---

## Final verification (end-to-end)

```bash
yarn verify          # typecheck + typecheck:scripts + lint + build + test (incl. Tasks 1 & 3)
```

Then confirm the new CI `pack-smoke` job (Task 2) goes green on the pushed branch.

Manual hook-contract spot-check (optional, proves the desktop boundary by hand):

```bash
echo '{"tool_input":{"command":"rm -rf /"}}' | node dist/cli.js guard bash --from-hook ; echo "exit=$?"
# expect: {"permissionDecision":"deny",...} on stdout, exit=1
echo '{"tool_input":{"command":"yarn test"}}' | node dist/cli.js guard bash --from-hook ; echo "exit=$?"
# expect: no stdout, exit=0
```

## Critical files

- `tests/helpers/fixture-runner.js` — add `runHausRaw`
- `tests/guard-hook-contract.test.js` — new (Task 1)
- `tests/install-roundtrip.test.js` — new (Task 3)
- `.github/workflows/ci.yml` — add `pack-smoke` job (Task 2)
- `src/commands/guard.ts`, `src/install/settings-merge.ts` — under test, not modified
