#!/usr/bin/env tsx
/**
 * P2 — Hook cost audit.
 *
 * Times each `--from-hook` entrypoint against a representative fixture repo
 * and reports wall time + stdout token estimate. Output drives the
 * keep/gate/drop decision matrix recorded in
 * `docs/specs/2026-05-25-hook-cost-report.md`.
 *
 * Hooks measured (the four wired by `src/claude/load-hooks.ts`):
 *   - `haus context --from-hook`         (UserPromptSubmit)
 *   - `haus memory inject --from-hook`   (UserPromptSubmit)
 *   - `haus guard file-access --from-hook` (PreToolUse Read|Edit|Write)
 *   - `haus guard bash --from-hook`      (PreToolUse Bash)
 *
 * Methodology:
 *   - Always rebuild `dist/` before measuring so results match current
 *     sources (`--no-build` escape hatch for fast re-runs against an
 *     already-built CLI).
 *   - Run `haus init` + `haus apply --write` inside a tmp copy of
 *     `tests/fixtures/repos/nextjs-app` so the hooks have realistic
 *     `.haus-workflow/` + `.claude/` state to read.
 *   - For each hook, run N=10 invocations (one warm-up discarded).
 *   - Record p50 + p95 wall time (linear-interpolated; NumPy-style) and
 *     stdout byte count.
 *   - Token estimate = bytes / 4 (≈ Claude tokenizer rule of thumb;
 *     conservative for ASCII).
 *
 * Thresholds from the plan: a hook should be gated (default off) or dropped
 * if it exceeds 150ms p50 wall *or* 300 stdout tokens per call without
 * commensurate value.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { execaSync } from "execa";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(REPO_ROOT, "dist/cli.js");
const FIXTURE = path.join(REPO_ROOT, "tests/fixtures/repos/nextjs-app");
const REPORT = path.join(REPO_ROOT, "docs/specs/2026-05-25-hook-cost-report.md");

const ITERATIONS = 10; // 1 warm-up discarded + 10 measured

type HookSpec = {
  id: string;
  args: string[];
  stdin?: string;
  description: string;
};

const HOOKS: HookSpec[] = [
  {
    id: "haus context --from-hook",
    args: ["context", "--from-hook"],
    description: "UserPromptSubmit — emits selected rules + token-reduction summary",
  },
  {
    id: "haus memory inject --from-hook",
    args: ["memory", "inject", "--from-hook"],
    description: "UserPromptSubmit — injects Haus memory (capped at 1200 chars)",
  },
  {
    id: "haus guard file-access --from-hook",
    args: ["guard", "file-access", "--from-hook"],
    stdin: JSON.stringify({ tool_input: { path: "src/app/page.tsx" } }),
    description: "PreToolUse(Read|Edit|Write) — denies on sensitive paths",
  },
  {
    id: "haus guard bash --from-hook",
    args: ["guard", "bash", "--from-hook"],
    stdin: JSON.stringify({ tool_input: { command: "ls -la" } }),
    description: "PreToolUse(Bash) — denies on dangerous commands",
  },
];

type Measurement = {
  hook: HookSpec;
  wallMs: number[];
  bytes: number[];
  exitCode: number;
};

function ensureBuild(skipBuild: boolean): void {
  // Default behaviour: rebuild on every run so the bench always reflects
  // current sources. `--no-build` opts out for fast re-runs against a known
  // dist/. Missing dist/ + --no-build is an error.
  if (skipBuild) {
    if (!fs.existsSync(CLI)) {
      throw new Error(`dist/cli.js missing — drop --no-build or run \`yarn build\` first.`);
    }
    return;
  }
  process.stdout.write("Building dist/ ...\n");
  execaSync("yarn", ["build"], { cwd: REPO_ROOT, stdio: "inherit" });
}

function setupFixture(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haus-bench-hooks-"));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
  process.stdout.write(`Setting up fixture at ${tmp}\n`);
  execaSync("node", [CLI, "init"], { cwd: tmp });
  execaSync("node", [CLI, "apply", "--write"], { cwd: tmp });
  // `apply --write` emits .haus-workflow/config.json with both gated hooks off.
  // The bench MUST measure the raw cost of the hook body — otherwise the
  // gated hooks would short-circuit and report 0 tokens + a misleadingly
  // fast wall time. Force-enable all gated hooks for the duration of the
  // benchmark only.
  const cfg = {
    hooks: {
      context: { enabled: true },
      memoryInject: { enabled: true },
    },
  };
  fs.writeFileSync(path.join(tmp, ".haus-workflow/config.json"), JSON.stringify(cfg, null, 2));
  return tmp;
}

function timeOne(cwd: string, hook: HookSpec): { ms: number; bytes: number; exitCode: number } {
  const start = performance.now();
  const result = execaSync("node", [CLI, ...hook.args], {
    cwd,
    input: hook.stdin,
    reject: false,
  });
  const ms = performance.now() - start;
  return { ms, bytes: Buffer.byteLength(result.stdout, "utf8"), exitCode: result.exitCode ?? 0 };
}

function measure(cwd: string, hook: HookSpec): Measurement {
  // Warm-up: discard first run (covers Node startup cache effects).
  timeOne(cwd, hook);
  const wallMs: number[] = [];
  const bytes: number[] = [];
  let exitCode = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const one = timeOne(cwd, hook);
    wallMs.push(one.ms);
    bytes.push(one.bytes);
    // Track the worst (max) exit code so a single intermittent failure in
    // the middle of the loop is still surfaced in the report.
    if (one.exitCode > exitCode) exitCode = one.exitCode;
  }
  return { hook, wallMs, bytes, exitCode };
}

/**
 * Linear-interpolated percentile on a sorted array.
 *
 * Position = (p/100) * (n - 1) ∈ [0, n-1]. For non-integer positions,
 * linearly interpolate between the two flanking samples. This matches
 * the conventional definition used by NumPy `quantile`, R `quantile`
 * type 7, Excel `PERCENTILE.INC`, etc., and avoids the upward bias of
 * `floor(p/100 * n)` (which on 10 samples returned the 6th element for
 * p50 and the max for p95).
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function classify(p50Ms: number, p50Tokens: number): "keep" | "gate-default-off" | "drop-candidate" {
  if (p50Ms > 150 || p50Tokens > 300) return "gate-default-off";
  return "keep";
}

function renderReport(results: Measurement[]): string {
  const lines: string[] = [];
  lines.push("# Hook cost audit (P2)");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Iterations per hook: ${ITERATIONS} (plus 1 warm-up discarded)`);
  lines.push(`Fixture: \`tests/fixtures/repos/nextjs-app\` (init + apply --write)`);
  lines.push(`Node: ${process.version} on ${os.platform()} ${os.arch()}`);
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  lines.push(
    "Each hook is invoked via `node dist/cli.js` against an applied fixture project. Wall time is high-resolution (`performance.now()`); stdout bytes are converted to a conservative token estimate at 4 bytes/token.",
  );
  lines.push("");
  lines.push("Thresholds (from the implementation plan):");
  lines.push("");
  lines.push("- **keep** — p50 wall ≤ 150 ms *and* p50 tokens ≤ 300");
  lines.push("- **gate-default-off** — exceeds either threshold; ship behind a config flag, default off");
  lines.push(
    "- **drop-candidate** — exceeds thresholds and provides no commensurate value (decided per-hook in the table)",
  );
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push("| Hook | p50 ms | p95 ms | p50 tokens | p95 tokens | exit | Classification |");
  lines.push("|---|---:|---:|---:|---:|---:|---|");
  for (const r of results) {
    const p50 = median(r.wallMs);
    const p95 = percentile(r.wallMs, 95);
    const p50Tok = median(r.bytes) / 4;
    const p95Tok = percentile(r.bytes, 95) / 4;
    const cls = classify(p50, p50Tok);
    lines.push(
      `| \`${r.hook.id}\` | ${p50.toFixed(0)} | ${p95.toFixed(0)} | ${p50Tok.toFixed(0)} | ${p95Tok.toFixed(0)} | ${r.exitCode} | ${cls} |`,
    );
  }
  lines.push("");
  lines.push("## Per-hook detail");
  lines.push("");
  for (const r of results) {
    lines.push(`### \`${r.hook.id}\``);
    lines.push("");
    lines.push(r.hook.description);
    lines.push("");
    lines.push(
      `- Wall ms (sorted): ${[...r.wallMs]
        .sort((a, b) => a - b)
        .map((v) => v.toFixed(0))
        .join(", ")}`,
    );
    lines.push(`- Stdout bytes:    ${r.bytes.join(", ")}`);
    lines.push(`- Exit code:       ${r.exitCode}`);
    lines.push("");
  }
  lines.push(AUTO_END_MARKER);
  lines.push("");
  lines.push("## Decisions");
  lines.push("");
  lines.push(
    "Decisions are recorded per hook based on the table above plus a judgement on whether the output is load-bearing for Claude's context.",
  );
  lines.push("");
  lines.push("| Hook | Decision | Reasoning |");
  lines.push("|---|---|---|");
  for (const r of results) {
    const p50 = median(r.wallMs);
    const p50Tok = median(r.bytes) / 4;
    const cls = classify(p50, p50Tok);
    lines.push(`| \`${r.hook.id}\` | ${cls} | _to be filled in by reviewer_ |`);
  }
  lines.push("");
  lines.push("## Follow-up");
  lines.push("");
  lines.push(
    "- Any **gate-default-off** decisions add a flag under `.haus-workflow/config.json` (`hooks.<key>.enabled`), read by `isHookEnabled(root, key)` from `src/claude/load-hooks-config.ts`. The gated hook's command short-circuits in `--from-hook` mode when the flag is not `true`.",
  );
  lines.push(
    "- Any **drop-candidate** decisions are confirmed by the project lead, then added to `docs/specs/pre-release-cleanup.md` as P4c removal targets.",
  );
  return lines.join("\n") + "\n";
}

/**
 * Anchor that separates the auto-generated upper section from curated
 * decision content below. `--overwrite` only replaces content up to and
 * including this marker; anything after is preserved verbatim. The marker
 * is an HTML comment so it renders invisibly in the published doc.
 */
const AUTO_END_MARKER = "<!-- BENCH:AUTO-END -->";

/**
 * Build the file content to write. If the existing file has the auto-end
 * marker, splice fresh auto-generated content above it and keep everything
 * below it intact. Otherwise (first run, or marker stripped) write the
 * full rendered report.
 */
function buildOutput(results: Measurement[]): string {
  const fresh = renderReport(results);
  if (!fs.existsSync(REPORT)) return fresh;
  const existing = fs.readFileSync(REPORT, "utf8");
  const existingMarkerAt = existing.indexOf(AUTO_END_MARKER);
  if (existingMarkerAt === -1) return fresh;
  const freshMarkerAt = fresh.indexOf(AUTO_END_MARKER);
  if (freshMarkerAt === -1) return fresh; // safety net
  const newTop = fresh.slice(0, freshMarkerAt + AUTO_END_MARKER.length);
  const oldBottom = existing.slice(existingMarkerAt + AUTO_END_MARKER.length);
  return newTop + oldBottom;
}

function main(): void {
  const skipBuild = process.argv.includes("--no-build");
  ensureBuild(skipBuild);
  const fixtureRoot = setupFixture();
  try {
    const results: Measurement[] = [];
    for (const hook of HOOKS) {
      process.stdout.write(`Measuring ${hook.id} ...\n`);
      results.push(measure(fixtureRoot, hook));
    }
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    const overwrite = process.argv.includes("--overwrite");
    // Default behaviour: refresh only the auto-generated upper section,
    // preserving everything after the BENCH:AUTO-END marker (curated
    // decisions, follow-ups, etc.). `--overwrite` clobbers the whole file
    // back to the template version — use it intentionally.
    const md = overwrite ? renderReport(results) : buildOutput(results);
    fs.writeFileSync(REPORT, md);
    if (overwrite) {
      process.stdout.write(`\nReport fully overwritten: ${path.relative(REPO_ROOT, REPORT)}\n`);
    } else {
      process.stdout.write(`\nReport refreshed (curated section preserved): ${path.relative(REPO_ROOT, REPORT)}\n`);
    }
    process.stdout.write("\n--- Summary ---\n");
    for (const r of results) {
      const p50 = median(r.wallMs);
      const p50Tok = median(r.bytes) / 4;
      process.stdout.write(
        `${r.hook.id.padEnd(40)}  p50 ${p50.toFixed(0).padStart(4)}ms  ${p50Tok.toFixed(0).padStart(4)}tok  ${classify(p50, p50Tok)}\n`,
      );
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

main();
