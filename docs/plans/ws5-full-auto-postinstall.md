# WS5 — Full-auto postinstall on global npm install

> Source: `docs/plans/system-audit-remediation.md` §A.9 / Part B WS5. One branch → one PR → merge before WS10.
> Independent (no WS3→WS4→WS6 chain). **Checkpoint before this WS** (it silently edits `~/.claude/settings.json`).

## Goal

`npm i -g @haus-tech/haus-workflow` runs `haus install` automatically — once, idempotently, non-fatally, global-only — and prints a clear notice of every file/setting it touched (since it edits `~/.claude/settings.json` silently). Also fixes the latent `prepare: husky` crash for git-install consumers.

## Design

A plain-Node `scripts/postinstall.mjs` (no tsx — consumers don't have it) decides via pure gates whether to run, then invokes the bundled CLI by absolute path: `node <pkgRoot>/dist/cli.js install --postinstall`. The `--postinstall` flag only changes the **notice** (install already merges hooks + deny + allow). Fail-open: any error → exit 0.

### Gates (fail-open to a safe no-op)
Run **only** when ALL hold:
- `process.env.npm_config_global === 'true'` — global installs only (a local `npm install` leaves this unset → skip).
- `process.env.CI` is falsy — never in CI.
- `process.env.HAUS_NO_POSTINSTALL !== '1'` — explicit escape hatch.
- `<pkgRoot>/dist/cli.js` exists — published tarball has it.
- `<pkgRoot>/src` does NOT exist — guards against the package's own dev checkout (published `files` omit `src/`), so `yarn install` in this repo never self-triggers.

Gate logic lives in an exported pure function `shouldRunPostinstall({ env, distExists, srcExists })` → `{ run, reason }`, so it is unit-testable without spawning npm.

### Non-fatal discipline (double)
- `package.json`: `"postinstall": "node ./scripts/postinstall.mjs || true"` (shell-level).
- `postinstall.mjs`: whole body in try/catch → `process.exit(0)` always (process-level). The spawned CLI is run with `|| true` semantics via `spawnSync` whose nonzero exit is swallowed.

### Notice (`install --postinstall`)
After a successful postinstall write, print (to stdout, npm surfaces it):
```
haus configured Claude Code for you:
  • N file(s) added to ~/.claude (skills, slash commands)
  • merged hooks + security rules into ~/.claude/settings.json
Undo any time with:  haus uninstall
Disable this on install:  HAUS_NO_POSTINSTALL=1
```
Counts come from `ApplyResult`. Non-postinstall `haus install` keeps its current concise line.

### prepare fix
`"prepare": "husky || true"` — `|| true` resolves the git-install crash when husky is absent (WS10 later swaps husky→lefthook entirely; the `|| true` is the durable fix regardless of tool).

---

## Tasks

### T1 — `install --postinstall` flag + notice
**What:** Add `.option('--postinstall')` in `src/cli.ts` install block; thread `postinstall?: boolean` into `runInstall` (`src/commands/install.ts`). When set, after a successful write, print the multi-line notice (files touched + hooks/rules merged + undo + disable). When not set, behavior unchanged.
**Acceptance:** `haus install --postinstall` writes files AND prints the notice incl. `haus uninstall` and `HAUS_NO_POSTINSTALL`; plain `haus install` notice unchanged.
**Verify:** `tests/postinstall.test.js` asserts notice content via a real `applyInstall` into a stubbed HOME (mirror install.test.js HOME-stub pattern); `yarn test`.

### T2 — `scripts/postinstall.mjs` (gates + spawn)
**What:** New plain-Node ESM script. Exports `shouldRunPostinstall({ env, distExists, srcExists })`. Main block (run only when invoked directly): resolve `pkgRoot` via `import.meta.url` (`..`), compute `distExists`/`srcExists`, call the gate; if `run`, `spawnSync('node', [cliPath, 'install', '--postinstall'], { stdio: 'inherit' })`; if skip, exit 0 silently (optionally a one-line reason on `HAUS_DEBUG`). Whole thing in try/catch → exit 0.
**Acceptance:** gate returns `run:false` for: non-global, CI set, `HAUS_NO_POSTINSTALL=1`, missing dist, present src — each with a distinct `reason`; `run:true` only when global + !CI + !optout + dist + !src.
**Verify:** `tests/postinstall.test.js` table-tests `shouldRunPostinstall` across the env/fs matrix; `yarn test` + `yarn typecheck:scripts`.

### T3 — package.json wiring
**What:** Add `"postinstall": "node ./scripts/postinstall.mjs || true"`; change `"prepare": "husky"` → `"husky || true"`; add `"scripts/postinstall.mjs"` to the `files` array.
**Acceptance:** `npm pack --dry-run` includes `scripts/postinstall.mjs`; `prepare` no longer hard-fails without husky.
**Verify:** `npm pack --dry-run` output check (manual); `tests/postinstall.test.js` asserts package.json has the postinstall script + the file is listed in `files`.

---

## Verification gate (whole WS)

- `tests/postinstall.test.js` (gate matrix + notice + package.json wiring) + `yarn verify`.
- Manual: `npm pack`, then in a throwaway HOME `npm i -g ./<tarball>` → assert install ran once + notice printed + `~/.claude` populated; re-run → idempotent (hash-based, no dupes); `HAUS_NO_POSTINSTALL=1 npm i -g ./<tarball>` → no-op; a local `npm install` in a sample consumer (non-global) → no trigger.
- Adversarial fresh-context review before commit; address Copilot; `Co-Authored-By: Claude Opus 4.8`.

## Out of scope

Husky→Lefthook switch (that's WS10 — here only the `|| true` crash fix). No new catalog items.

## Task order

T1 (flag+notice) → T2 (gate script, depends on the flag existing) → T3 (wiring). Checkpoint before starting (per Part C).
