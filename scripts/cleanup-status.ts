#!/usr/bin/env tsx
/**
 * Pre-release cleanup tracker.
 *
 * Scans the repo for `HAUS-PRERELEASE-CLEANUP:` markers (any comment style),
 * parses `docs/specs/pre-release-cleanup.md` for tracked rows, and prints a
 * reconciliation report.
 *
 * Always exits 0 (non-blocking) until P10 makes it blocking at v0.1 publish.
 *
 * Design notes:
 * - Identity = repo-relative file path. Multiple markers in one file collapse
 *   to a single spec row; line numbers are not part of the identity (they
 *   shift too easily).
 * - Scan roots: `src/`, `scripts/`, `tests/`, `plugin/`, `library/`, `docs/`.
 * - Skips `node_modules/`, `dist/`, `.git/`, `docs/specs/pre-release-cleanup.md`
 *   itself (the spec describes markers; mentioning them must not register as
 *   markers).
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.env.HAUS_CLEANUP_ROOT
  ? path.resolve(process.env.HAUS_CLEANUP_ROOT)
  : path.resolve(import.meta.dirname, "..");
const SCAN_ROOTS = ["src", "scripts", "tests", "plugin", "library", "docs"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
// Files that legitimately mention the marker string (docs/tests/the script
// itself) must not register as real markers.
const SKIP_FILES = new Set([
  "docs/specs/pre-release-cleanup.md",
  "docs/specs/2026-05-25-implementation-plan.md",
  "docs/specs/2026-05-26-implementation-plan.md",
  "scripts/cleanup-status.ts",
  "tests/cleanup-status.test.js",
]);

// Real markers must sit inside a comment of one of the supported forms.
// Bare mentions inside string literals or prose must not register.
//   - `//` line comment  (TS/JS/TSX)
//   - `#`  line comment  (JSON-with-comments, YAML, shell)
//   - `<!-- ... -->`     (Markdown)
//   - `"_haus_cleanup": "HAUS-PRERELEASE-CLEANUP: ..."` (pure JSON — no
//     line comments allowed, so the marker rides on an inert top-level key)
// Each comment-style form requires start-of-line or whitespace before the
// comment opener, so quoted occurrences like
// `"// HAUS-PRERELEASE-CLEANUP: ..."` are not matched.
const MARKER_PATTERNS: RegExp[] = [
  /(?:^|\s)\/\/\s*HAUS-PRERELEASE-CLEANUP:\s*(.+?)\s*$/,
  /(?:^|\s)#\s*HAUS-PRERELEASE-CLEANUP:\s*(.+?)\s*$/,
  /(?:^|\s)<!--\s*HAUS-PRERELEASE-CLEANUP:\s*(.+?)\s*-->/,
  /^\s*"_haus_cleanup"\s*:\s*"HAUS-PRERELEASE-CLEANUP:\s*(.+?)\s*"/,
];

// Spec row format: `- [ ] \`path\` — reason` or `- [x] \`path\` — reason`.
const SPEC_ROW_RE = /^- \[([ xX])\]\s+`([^`]+)`\s*[—-]\s*(.+)$/;

type Marker = { file: string; line: number; reason: string };
type SpecRow = { file: string; reason: string; done: boolean };
export type CleanupReport = {
  markers: Marker[];
  spec: SpecRow[];
  ok: string[];
  missingSpec: Marker[];
  missingSpecFiles: string[]; // dedup of missingSpec by file
  orphanSpec: SpecRow[];
};

function walk(dir: string, acc: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
}

function scanMarkers(repoRoot: string): Marker[] {
  const markers: Marker[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = path.join(repoRoot, root);
    const files: string[] = [];
    walk(abs, files);
    for (const file of files) {
      const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
      if (SKIP_FILES.has(rel)) continue;
      let text: string;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!text.includes("HAUS-PRERELEASE-CLEANUP:")) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of MARKER_PATTERNS) {
          const match = pattern.exec(lines[i]);
          if (match) {
            markers.push({ file: rel, line: i + 1, reason: match[1].trim() });
            break;
          }
        }
      }
    }
  }
  return markers;
}

function parseSpec(specPath: string): SpecRow[] {
  if (!fs.existsSync(specPath)) return [];
  const text = fs.readFileSync(specPath, "utf8");
  const rows: SpecRow[] = [];
  let inMarkersSection = false;
  for (const line of text.split(/\r?\n/)) {
    // Only the `## Markers` section holds real spec rows. Example rows
    // earlier in the document (under `## Spec entries`) must not count.
    if (/^##\s+Markers\b/.test(line)) {
      inMarkersSection = true;
      continue;
    }
    if (!inMarkersSection) continue;
    const match = SPEC_ROW_RE.exec(line);
    if (match) {
      rows.push({
        done: match[1].toLowerCase() === "x",
        file: match[2].trim(),
        reason: match[3].trim(),
      });
    }
  }
  return rows;
}

export function reconcile(repoRoot: string = REPO_ROOT): CleanupReport {
  const markers = scanMarkers(repoRoot);
  const spec = parseSpec(path.join(repoRoot, "docs/specs/pre-release-cleanup.md"));
  const specFiles = new Set(spec.map((r) => r.file));
  const markerFiles = new Set(markers.map((m) => m.file));

  const ok = [...markerFiles].filter((f) => specFiles.has(f)).sort();
  const missingSpec = markers.filter((m) => !specFiles.has(m.file));
  const missingSpecFiles = [...new Set(missingSpec.map((m) => m.file))].sort();
  const orphanSpec = spec.filter((r) => !markerFiles.has(r.file) && !r.done);

  return { markers, spec, ok, missingSpec, missingSpecFiles, orphanSpec };
}

function render(report: CleanupReport): string {
  const lines: string[] = [];
  lines.push("Pre-release cleanup status");
  lines.push("==========================");
  lines.push("");
  lines.push(`Markers found:  ${report.markers.length}`);
  lines.push(`Spec rows:      ${report.spec.length}`);
  lines.push(`OK pairs:       ${report.ok.length}`);
  // Counts dedupe by file (spec identity is file-level). Marker-level detail
  // is still printed under each file below.
  lines.push(`MISSING_SPEC:   ${report.missingSpecFiles.length}`);
  lines.push(`ORPHAN_SPEC:    ${report.orphanSpec.length}`);
  lines.push("");
  if (report.missingSpecFiles.length > 0) {
    lines.push("MISSING_SPEC — markers found, no spec row:");
    for (const file of report.missingSpecFiles) {
      lines.push(`  ${file}`);
      for (const m of report.missingSpec.filter((mk) => mk.file === file)) {
        lines.push(`    line ${m.line}: ${m.reason}`);
      }
    }
    lines.push("");
  }
  if (report.orphanSpec.length > 0) {
    lines.push("ORPHAN_SPEC — spec row, no marker:");
    for (const r of report.orphanSpec) {
      lines.push(`  ${r.file}  ${r.reason}`);
    }
    lines.push("");
  }
  if (report.ok.length > 0) {
    lines.push("OK — marker + spec row paired:");
    for (const f of report.ok) lines.push(`  ${f}`);
    lines.push("");
  }
  if (report.markers.length === 0 && report.spec.length === 0) {
    lines.push("No markers, no spec entries. Tracker idle.");
  }
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  const report = reconcile();
  process.stdout.write(render(report) + "\n");
  const hasIssues = report.missingSpec.length > 0 || report.orphanSpec.length > 0;
  process.exit(hasIssues ? 1 : 0);
}
