/**
 * Core aggregation logic behind `haus ci-gate` — combines `doctor`, `decisions check`,
 * and `update --check --fast` into one documented pass/fail contract for CI, instead of
 * a pipeline needing three separate commands that each independently set
 * `process.exitCode`.
 *
 * Lives outside `src/commands/` deliberately: that directory's own module boundary
 * (docs/architecture.md — "thin CLI handlers only; delegate to core modules, never
 * import from each other") forbids one command file importing another. This module
 * needs `runDoctor` and `runUpdate` from `../commands/`, so it lives here instead, with
 * `src/commands/ci-gate.ts` staying a thin re-export.
 *
 * Uses the fast/cheap `update --check` tier (no per-item content hashing) rather than
 * the fully-hashed tier — a full hash pass on every CI run is expensive, and this
 * command is meant to run on every push. Run `haus update --check` directly (without
 * `--fast`) for the fully-hashed tier.
 */
import { runDoctor } from '../commands/doctor.js'
import { runUpdate } from '../commands/update.js'
import { runDecisionsCheck } from '../decisions/check.js'
import { error, log } from '../utils/logger.js'

type CheckOutcome = { ok: boolean; output: string[] }

/**
 * Runs `fn` with `console.log`/`warn`/`error` captured (instead of printed) and
 * `process.exitCode` isolated to just this call, so aggregating independent commands
 * doesn't let one's exit code leak into another's, or into the aggregate command's own
 * final exit code before all checks have run.
 */
async function captureCheck(fn: () => Promise<void>): Promise<CheckOutcome> {
  const prevExitCode = process.exitCode
  process.exitCode = undefined
  const output: string[] = []
  const record = (...args: unknown[]) => {
    output.push(args.map(String).join(' '))
  }
  const originalLog = console.log // eslint-disable-line no-console
  const originalWarn = console.warn // eslint-disable-line no-console
  const originalError = console.error // eslint-disable-line no-console
  console.log = record // eslint-disable-line no-console
  console.warn = record // eslint-disable-line no-console
  console.error = record // eslint-disable-line no-console
  // A thrown error from `fn` (not just a nonzero `process.exitCode`) must still result
  // in a normal { ok, output } for this one check — otherwise it propagates out of
  // `runCiGate` entirely, aborting whichever of the other two checks hadn't run yet,
  // discarding results already computed for checks that had, and (in --json mode)
  // replacing the documented {doctor, decisions, update, ok} contract with a bare
  // top-level error message on stderr instead of parseable JSON on stdout.
  let threw: unknown
  try {
    await fn()
  } catch (err) {
    threw = err
  } finally {
    console.log = originalLog // eslint-disable-line no-console
    console.warn = originalWarn // eslint-disable-line no-console
    console.error = originalError // eslint-disable-line no-console
  }
  if (threw !== undefined) {
    output.push(threw instanceof Error ? threw.message : String(threw))
  }
  // Fail closed: only an explicit process.exitCode of exactly 0 (or never set) counts
  // as a pass. Every exitCode-setting call site in this repo today uses only 0 or 1,
  // but treating anything-other-than-1 as success (the inverse check) would silently
  // report a pass for a hypothetical future exitCode of 2 or similar.
  const ok = threw === undefined && (process.exitCode === undefined || process.exitCode === 0)
  process.exitCode = prevExitCode
  return { ok, output }
}

/**
 * `decisions check`'s underlying implementation already returns a structured result
 * (`../decisions/check.js`'s `runDecisionsCheck`), unlike `doctor`/`update` — so this
 * check needs neither console capture nor `process.exitCode` isolation, and can't
 * silently swallow a thrown error the way the console-capture path could.
 *
 * Reads `PR_BODY` the same way the `decisions check` CLI command itself defaults to
 * (`src/commands/decisions.ts`'s `options.prBody ?? process.env.PR_BODY`) — an
 * `[adr-skip]` token there should waive the gate here too, matching what running
 * `haus decisions check` standalone in the same CI environment would do.
 */
async function checkDecisions(root: string): Promise<CheckOutcome> {
  const result = await runDecisionsCheck(root, { prBody: process.env['PR_BODY'] })
  return { ok: result.satisfied, output: result.reasons }
}

export async function runCiGate(options: { json?: boolean } = {}): Promise<void> {
  const root = process.cwd()
  const doctorResult = await captureCheck(() => runDoctor())
  const decisionsResult = await checkDecisions(root)
  const updateResult = await captureCheck(() => runUpdate({ check: true, fast: true }))

  const ok = doctorResult.ok && decisionsResult.ok && updateResult.ok

  if (options.json) {
    log(
      JSON.stringify(
        { doctor: doctorResult, decisions: decisionsResult, update: updateResult, ok },
        null,
        2,
      ),
    )
  } else {
    log(`doctor:    ${doctorResult.ok ? 'PASS' : 'FAIL'}`)
    log(`decisions: ${decisionsResult.ok ? 'PASS' : 'FAIL'}`)
    log(`update:    ${updateResult.ok ? 'PASS' : 'FAIL'}`)
    if (ok) {
      log('haus ci-gate: all checks passed')
    } else {
      error('haus ci-gate: one or more checks failed')
      for (const [name, result] of [
        ['doctor', doctorResult],
        ['decisions', decisionsResult],
        ['update', updateResult],
      ] as const) {
        if (!result.ok) {
          error(`--- ${name} ---`)
          for (const line of result.output) error(line)
        }
      }
    }
  }

  process.exitCode = ok ? 0 : 1
}
