# Hook cost audit (P2)

Generated: 2026-05-25T14:20:34.807Z
Iterations per hook: 10 (plus 1 warm-up discarded)
Fixture: `tests/fixtures/repos/nextjs-app` (init + apply --write)
Node: v22.22.3 on darwin x64

## Methodology

Each hook is invoked via `node dist/cli.js` against an applied fixture project. Wall time is high-resolution (`performance.now()`); stdout bytes are converted to a conservative token estimate at 4 bytes/token.

Thresholds (from the implementation plan):

- **keep** — p50 wall ≤ 150 ms *and* p50 tokens ≤ 300
- **gate-default-off** — exceeds either threshold; ship behind a config flag, default off
- **drop-candidate** — exceeds thresholds and provides no commensurate value (decided per-hook in the table)

## Results

| Hook | p50 ms | p95 ms | p50 tokens | p95 tokens | exit | Classification |
|---|---:|---:|---:|---:|---:|---|
| `haus context --from-hook` | 392 | 397 | 78 | 78 | 0 | gate-default-off |
| `haus memory inject --from-hook` | 391 | 399 | 23 | 23 | 0 | gate-default-off |
| `haus guard file-access --from-hook` | 385 | 397 | 0 | 0 | 0 | gate-default-off |
| `haus guard bash --from-hook` | 390 | 403 | 0 | 0 | 0 | gate-default-off |

## Per-hook detail

### `haus context --from-hook`

UserPromptSubmit — emits selected rules + token-reduction summary

- Wall ms (sorted): 385, 385, 390, 391, 392, 392, 393, 394, 395, 399
- Stdout bytes:    313, 313, 313, 313, 313, 313, 313, 313, 313, 313
- Exit code:       0

### `haus memory inject --from-hook`

UserPromptSubmit — injects Haus memory (capped at 1200 chars)

- Wall ms (sorted): 388, 389, 389, 390, 390, 393, 393, 398, 398, 400
- Stdout bytes:    93, 93, 93, 93, 93, 93, 93, 93, 93, 93
- Exit code:       0

### `haus guard file-access --from-hook`

PreToolUse(Read|Edit|Write) — denies on sensitive paths

- Wall ms (sorted): 382, 384, 384, 385, 385, 386, 389, 393, 396, 397
- Stdout bytes:    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
- Exit code:       0

### `haus guard bash --from-hook`

PreToolUse(Bash) — denies on dangerous commands

- Wall ms (sorted): 382, 383, 384, 385, 389, 391, 396, 398, 398, 408
- Stdout bytes:    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
- Exit code:       0

<!-- BENCH:AUTO-END -->

## Key observation

The ~400 ms p50 floor across **all four** hooks is dominated by **Node startup + import resolution**, not by the hook's own work. The actual work each hook does (read context map, scan a path against a denylist, slice a memory string) runs in single-digit milliseconds. This means:

- Optimising the *body* of any hook yields ≤ ~10 ms.
- The only way to drop hook cost meaningfully is to **avoid the spawn** — either by removing the hook entirely, gating it off, or moving it into a long-running process (out of scope for v0.1).

For a Claude turn that triggers Bash 5×, Read 3×, Edit 2× plus the UserPromptSubmit pair: today that's ~12 × ~400 ms = **~4.8 s of hook overhead per turn** before any model work happens. This is the single largest justification for gating the non-load-bearing hooks.

## Decisions

Decisions are recorded per hook based on the table above plus a judgement on whether the output is load-bearing for Claude's context. (Bench raw cost is measured with both gated hooks force-enabled in the fixture; production behaviour is the gated short-circuit.)

| Hook | Decision | Reasoning |
|---|---|---|
| `haus context --from-hook` | **gate-default-off** | 78 tokens of repeat-on-every-prompt context summary. The same information is already surfaced through `CLAUDE.md` + selected rules; injecting it again on every prompt costs ~400 ms and ~80 tokens with no new signal. Useful for opt-in debugging ("why did Haus pick these rules?"), not for steady-state. |
| `haus memory inject --from-hook` | **gate-default-off** | 23 tokens on a fresh project (memory store empty). Only useful when the memory store has substance, which is itself an opt-in capability. Default off; users who actively use `haus memory add` enable it. |
| `haus guard file-access --from-hook` | **keep** | Real safety value (blocks reading `.env` and other sensitive paths). ~400 ms once per Read/Edit/Write isn't free, but it's the only enforcement point we have for sensitive-path policy. Re-evaluate after we have a faster guard implementation. |
| `haus guard bash --from-hook` | **keep** | Same reasoning as file-access. Blocking dangerous commands (`rm -rf /`, `:(){:|:&};:`, etc.) is load-bearing for the workflow's safety story. |

## Wiring (shipped in this PR)

For each **gate-default-off** hook:

1. `.haus-ai/config.json` carries the flag:
   ```json
   {
     "hooks": {
       "context": { "enabled": false },
       "memoryInject": { "enabled": false }
     }
   }
   ```
2. `src/claude/load-hooks-config.ts` exports `isHookEnabled(root, key)` which requires strict boolean `=== true`; anything else (missing file, malformed JSON, fuzzy truthy values) keeps the hook off.
3. The gated command (`src/commands/context.ts`, `src/commands/memory.ts`) calls `isHookEnabled` at the top of its `--from-hook` path and returns early when disabled (exit 0, no stdout). Non-hook CLI use is unaffected.
4. `haus apply --write` emits the config file with both flags off on first run; existing config is left untouched.
5. `haus doctor` prints a per-hook enabled/disabled line.

For the two **keep** hooks: no immediate code change. Track in a follow-up ticket whether to:

- Compile the CLI into a single-file binary (`pkg`, `nexe`) to drop the startup cost.
- Move the guards into the plugin's own JS, avoiding the CLI spawn entirely.

## Follow-up

- Wiring lands in the same PR as this report (P2 acceptance).
- After v0.1 publish, revisit the ~400 ms Node-spawn floor as a perf project.
