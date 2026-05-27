import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Drives scripts/cleanup-status.ts as a subprocess, with HAUS_CLEANUP_ROOT
// pointing at a tmp fixture tree. tsx is resolved through the repo's
// node_modules so the test does not depend on global PATH.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts/cleanup-status.ts");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "haus-cleanup-"));
}

// Returns { stdout, status } — does not throw on non-zero exit.
function runIn(tmpRoot) {
  const result = spawnSync(tsxBin, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, HAUS_CLEANUP_ROOT: tmpRoot, NODE_NO_WARNINGS: "1" },
  });
  return { stdout: result.stdout ?? "", status: result.status ?? 1 };
}

// Convenience: returns stdout string for tests that only check output text.
function runInStdout(tmpRoot) {
  return runIn(tmpRoot).stdout;
}

function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

test("idle: no markers and empty spec => tracker idle", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  const { stdout, status } = runIn(tmp);
  assert.match(stdout, /Markers found:\s+0/);
  assert.match(stdout, /Spec rows:\s+0/);
  assert.match(stdout, /No markers, no spec entries\. Tracker idle\./);
  assert.equal(status, 0, "idle state should exit 0");
});

test("MISSING_SPEC: marker without spec row is flagged", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/example.ts",
    "// HAUS-PRERELEASE-CLEANUP: P4a sources removal\nexport const x = 1;\n",
  );
  const { stdout, status } = runIn(tmp);
  assert.match(stdout, /Markers found:\s+1/);
  assert.match(stdout, /MISSING_SPEC:\s+1/);
  assert.match(stdout, /src\/example\.ts/);
  assert.match(stdout, /line 1: P4a sources removal/);
  assert.equal(status, 1, "MISSING_SPEC should exit 1");
});

test("ORPHAN_SPEC: spec row without marker is flagged", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\n## Markers\n\n- [ ] `src/ghost.ts` — gone but not forgotten\n",
  );
  const { stdout, status } = runIn(tmp);
  assert.match(stdout, /Spec rows:\s+1/);
  assert.match(stdout, /ORPHAN_SPEC:\s+1/);
  assert.match(stdout, /src\/ghost\.ts\s+gone but not forgotten/);
  assert.equal(status, 1, "ORPHAN_SPEC should exit 1");
});

test("OK: marker and spec row pair counted as OK", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\n## Markers\n\n- [ ] `src/old.ts` — remove in P4b\n",
  );
  writeFile(tmp, "src/old.ts", "// HAUS-PRERELEASE-CLEANUP: remove in P4b\nexport {};\n");
  const out = runInStdout(tmp);
  assert.match(out, /OK pairs:\s+1/);
  assert.match(out, /MISSING_SPEC:\s+0/);
  assert.match(out, /ORPHAN_SPEC:\s+0/);
});

test("checked spec row with no marker is not flagged as orphan", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\n## Markers\n\n- [x] `src/deleted.ts` — removed in P4a\n",
  );
  const out = runInStdout(tmp);
  assert.match(out, /Spec rows:\s+1/);
  assert.match(out, /ORPHAN_SPEC:\s+0/);
});

test("markdown HTML-comment marker style is recognised", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "docs/note.md",
    "# title\n\n<!-- HAUS-PRERELEASE-CLEANUP: doc rewrite in P4c -->\nbody\n",
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+1/);
  assert.match(out, /docs\/note\.md/);
  assert.match(out, /line 3: doc rewrite in P4c/);
});

test("spec file is not self-scanned for markers", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\nUse `HAUS-PRERELEASE-CLEANUP: <reason>` in code.\n\n## Markers\n",
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+0/);
});

test("pure-JSON _haus_cleanup marker is recognised", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "plugin/hooks/hooks.json",
    '{\n  "_haus_cleanup": "HAUS-PRERELEASE-CLEANUP: P4e plugin removal",\n  "hooks": {}\n}\n',
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+1/);
  assert.match(out, /plugin\/hooks\/hooks\.json/);
  assert.match(out, /P4e plugin removal/);
});

test("_haus_cleanup key inside a TS string is not matched", () => {
  // Anchored to line start (^\s*) so a quoted occurrence inside a TS string
  // literal must not fire.
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/example.ts",
    'const x = \'{"_haus_cleanup": "HAUS-PRERELEASE-CLEANUP: quoted"}\';\n',
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+0/);
});

test("marker inside string literal is not matched (no comment prefix)", () => {
  // Bare `HAUS-PRERELEASE-CLEANUP:` text inside a string literal must not
  // register — only the supported comment forms count.
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/quoted.ts",
    'export const msg = "HAUS-PRERELEASE-CLEANUP: bare mention";\n',
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+0/);
});

test("inline trailing // marker is matched", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/inline.ts",
    "export const dead = 1; // HAUS-PRERELEASE-CLEANUP: dead const P4c\n",
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+1/);
  assert.match(out, /src\/inline\.ts/);
  assert.match(out, /dead const P4c/);
});

test("multiple markers in one file count as one MISSING_SPEC", () => {
  // Identity is file-level. Two markers in one file => MISSING_SPEC=1, but
  // both line-level details are still printed.
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/multi.ts",
    [
      "// HAUS-PRERELEASE-CLEANUP: first reason",
      "export const a = 1;",
      "// HAUS-PRERELEASE-CLEANUP: second reason",
      "export const b = 2;",
      "",
    ].join("\n"),
  );
  const out = runInStdout(tmp);
  assert.match(out, /Markers found:\s+2/);
  assert.match(out, /MISSING_SPEC:\s+1/);
  assert.match(out, /line 1: first reason/);
  assert.match(out, /line 3: second reason/);
});

test("example rows outside ## Markers section are ignored", () => {
  // Spec template shows an example row under ## Spec entries — must not count.
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    [
      "# spec",
      "",
      "## Spec entries",
      "",
      "Example:",
      "",
      "- [ ] `<path>` — <reason>",
      "",
      "## Markers",
      "",
    ].join("\n"),
  );
  const out = runInStdout(tmp);
  assert.match(out, /Spec rows:\s+0/);
});
