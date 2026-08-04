# ADR-0020: `haus ci-gate` — aggregate three commands without changing their own contracts

- **Status:** Accepted | **Date:** 2026-08-04
- **Decided by:** Aniisa Bihi (draft by Claude)
- **Affects:** `src/ci-gate/aggregate.ts`, `src/commands/ci-gate.ts`, `src/cli.ts`, `tests/ci-gate.test.js`
- **Related:** [docs/plans/cli-audit-section-8-and-prune.md](../plans/cli-audit-section-8-and-prune.md) (Task D)

## Context

`haus doctor`, `haus decisions check`, and `haus update --check` each independently set `process.exitCode` with no single documented contract a CI pipeline can rely on in one call — a CI script wanting all three has to invoke them separately and combine results itself. None of the three functions (`runDoctor`, `runDecisions`, `runUpdate`) return a structured pass/fail result; they only communicate outcome via the `process.exitCode` side effect and human-readable `console.log`/`warn`/`error` output.

## Decision

1. **`haus ci-gate [--json]` calls the three existing checks as black boxes — it does not modify `doctor.ts`, `decisions.ts`, or `update.ts`.** For `doctor` and `update`, a `captureCheck` helper snapshots and clears `process.exitCode` before each call, temporarily swaps `console.log`/`warn`/`error` for a capturing function, and restores both afterward. `decisions check` uses its own already-structured `runDecisionsCheck` (`src/decisions/check.ts`) directly instead — it returns `{ satisfied, reasons, ... }` already, so it needs neither console capture nor exit-code isolation. This keeps `haus doctor`, `haus decisions check`, and `haus update --check` completely unchanged as standalone commands — verified by a regression test that runs all three before and after a `ci-gate` invocation and asserts identical exit codes.
2. **The aggregation logic lives in `src/ci-gate/aggregate.ts`, not in `src/commands/ci-gate.ts`.** `src/commands/` is a documented module boundary (`docs/architecture.md`): "thin CLI handlers only; delegate to core modules, never import from each other." The aggregator needs `runDoctor` and `runUpdate`, both defined in sibling command files — importing them directly from `src/commands/ci-gate.ts` would violate that boundary (found in review). `src/ci-gate/aggregate.ts` sits alongside this repo's other topic-named core directories (`src/decisions/`, `src/update/`, ...) and is where the import is allowed to happen; `src/commands/ci-gate.ts` is now a one-line re-export.
3. **A thrown error from one of the checks is caught and converted into a structured failure**, not left to propagate. Without this, one check throwing would abort the other two entirely (they'd never run), discard any already-computed results, and — in `--json` mode — replace the documented `{doctor, decisions, update, ok}` contract with a bare error message on stderr instead of parseable JSON on stdout. `readJson` (used by both `doctor.ts` and `update.ts` to read `haus.lock.json`) rethrows any filesystem error other than `ENOENT`, so this is a real, reachable path (e.g. a TOCTOU race, or the lockfile becoming unreadable for any reason), not a hypothetical one.
4. **Pass/fail for `doctor`/`update` is `process.exitCode === undefined || process.exitCode === 0`, not the inverse (`!== 1`).** Every exit-code-setting call site in this codebase today uses only `0` or `1`, so the two checks are currently equivalent — but the inverse check fails open (a hypothetical future `process.exitCode = 2` would silently read as a pass), while this fails closed.
5. **Uses the fast/cheap `update --check --fast` tier, not the fully-hashed one.** `ci-gate` is meant to run on every push; a full per-item content hash on every CI run is the tradeoff `--fast` already exists to avoid (see the `--check --fast` addition in CLI audit §4). Documented in the command's own `--help` text, not just here.

## Motivation (why)

- The alternative — refactoring `doctor`/`decisions`/`update` to each return structured data, and having `ci-gate` call those instead of the black-box CLI entry points — would be a larger, riskier change touching three existing commands' internals for a purely additive feature. The capture-and-isolate approach gets the same aggregate result with zero behavior risk to the three existing commands.
- Failing closed on unexpected exit codes and on thrown errors both follow the same principle: an aggregator whose job is "tell me if any of these three things went wrong" must not have failure modes of its own that report false passes.

## Alternatives considered

- **Let a thrown error propagate and rely on the top-level `program.parseAsync(...).catch(...)` in `src/cli.ts`** — rejected; this was the bug found in review. It produces a different, non-structured output shape than `ci-gate`'s own contract, and silently drops any of the other two checks' results that had already completed.
- **Refactor `doctor`/`decisions`/`update` to expose structured result objects, and have `ci-gate` consume those directly instead of capturing console output** — rejected for this task; a real improvement, but a larger and separately-scoped change (per the CLI audit's Task D file list, which lists only `ci-gate.ts` + `cli.ts` + tests). `decisions check` already had this available (`runDecisionsCheck`) and now uses it; `doctor`/`update` don't, and extracting it is left as a natural follow-up if a fourth consumer of their structured results ever appears.
- **Invoke `doctor`/`decisions check`/`update --check` as subprocesses** (`node dist/cli.js doctor`, etc.), capturing stdout/stderr/exit code — also suggested in review as an alternative fix for the module-boundary violation. Rejected: three extra Node process spawns on every `ci-gate` run works against the same-process speed `--fast` is already there for (point 5), needs to reliably locate the built CLI entry point at runtime (fragile between `tsx`-run dev mode and the built `dist/cli.js`), and captures exactly the same unstructured text `captureCheck` already does — no gain in fidelity for the added overhead and fragility.

## Consequences

- `ci-gate`'s `output` arrays are unstructured strings (whatever `doctor`/`decisions`/`update` printed, or a thrown error's message) rather than typed data — a future consumer wanting machine-readable _details_ (not just per-check pass/fail) would need the refactor named in "Alternatives considered," not covered by this decision.
- `haus doctor`, `haus decisions check`, and `haus update --check` gain no new capability from this change and remain exactly as they were — `ci-gate` is purely additive.
