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
 *   - Build `dist/` if stale, then run `haus init` + `haus apply --write`
 *     inside a tmp copy of `tests/fixtures/repos/nextjs-app` so the hooks
 *     have realistic `.haus-ai/` + `.claude/` state to read.
 *   - For each hook, run N=10 invocations (one warm-up discarded).
 *   - Record p50 + p95 wall time and stdout byte count.
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

function ensureBuild(): void {
  if (fs.existsSync(CLI)) return;
  process.stdout.write("Building dist/ ...\n");
  execaSync("yarn", ["build"], { cwd: REPO_ROOT, stdio: "inherit" });
}

function setupFixture(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haus-bench-hooks-"));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
  process.stdout.write(`Setting up fixture at ${tmp}\n`);
  execaSync("node", [CLI, "init"], { cwd: tmp });
  execaSync("node", [CLI, "apply", "--write"], { cwd: tmp });
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
    exitCode = one.exitCode;
  }
  return { hook, wallMs, bytes, exitCode };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
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
    "- Any **gate-default-off** decisions wire a flag under `.haus-ai/config.json` (`hooks.<id>.enabled`) and a `loadHooksConfig()` helper consulted by the hook wrapper.",
  );
  lines.push(
    "- Any **drop-candidate** decisions are confirmed by the project lead, then added to `docs/specs/pre-release-cleanup.md` as P4c removal targets.",
  );
  return lines.join("\n") + "\n";
}

function main(): void {
  ensureBuild();
  const fixtureRoot = setupFixture();
  try {
    const results: Measurement[] = [];
    for (const hook of HOOKS) {
      process.stdout.write(`Measuring ${hook.id} ...\n`);
      results.push(measure(fixtureRoot, hook));
    }
    const md = renderReport(results);
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    const overwrite = process.argv.includes("--overwrite");
    if (fs.existsSync(REPORT) && !overwrite) {
      const sidecar = REPORT.replace(/\.md$/, `.rerun-${Date.now()}.md`);
      fs.writeFileSync(sidecar, md);
      process.stdout.write(
        `\nReport already exists; raw output written to sidecar: ${path.relative(REPO_ROOT, sidecar)}\n` +
          `Use --overwrite to replace the committed report.\n`,
      );
    } else {
      fs.writeFileSync(REPORT, md);
      process.stdout.write(`\nReport written: ${path.relative(REPO_ROOT, REPORT)}\n`);
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
