import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function runIn(tmpRoot) {
  return execFileSync(tsxBin, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, HAUS_CLEANUP_ROOT: tmpRoot, NODE_NO_WARNINGS: "1" },
  });
}

function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

test("idle: no markers and empty spec => tracker idle", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  const out = runIn(tmp);
  assert.match(out, /Markers found:\s+0/);
  assert.match(out, /Spec rows:\s+0/);
  assert.match(out, /No markers, no spec entries\. Tracker idle\./);
});

test("MISSING_SPEC: marker without spec row is flagged", () => {
  const tmp = makeTmp();
  writeFile(tmp, "docs/specs/pre-release-cleanup.md", "# spec\n\n## Markers\n");
  writeFile(
    tmp,
    "src/example.ts",
    "// HAUS-PRERELEASE-CLEANUP: P4a sources removal\nexport const x = 1;\n",
  );
  const out = runIn(tmp);
  assert.match(out, /Markers found:\s+1/);
  assert.match(out, /MISSING_SPEC:\s+1/);
  assert.match(out, /src\/example\.ts:1\s+P4a sources removal/);
});

test("ORPHAN_SPEC: spec row without marker is flagged", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\n## Markers\n\n- [ ] `src/ghost.ts` — gone but not forgotten\n",
  );
  const out = runIn(tmp);
  assert.match(out, /Spec rows:\s+1/);
  assert.match(out, /ORPHAN_SPEC:\s+1/);
  assert.match(out, /src\/ghost\.ts\s+gone but not forgotten/);
});

test("OK: marker and spec row pair counted as OK", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\n## Markers\n\n- [ ] `src/old.ts` — remove in P4b\n",
  );
  writeFile(tmp, "src/old.ts", "// HAUS-PRERELEASE-CLEANUP: remove in P4b\nexport {};\n");
  const out = runIn(tmp);
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
  const out = runIn(tmp);
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
  const out = runIn(tmp);
  assert.match(out, /Markers found:\s+1/);
  assert.match(out, /docs\/note\.md:3\s+doc rewrite in P4c/);
});

test("spec file is not self-scanned for markers", () => {
  const tmp = makeTmp();
  writeFile(
    tmp,
    "docs/specs/pre-release-cleanup.md",
    "# spec\n\nUse `HAUS-PRERELEASE-CLEANUP: <reason>` in code.\n\n## Markers\n",
  );
  const out = runIn(tmp);
  assert.match(out, /Markers found:\s+0/);
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
  const out = runIn(tmp);
  assert.match(out, /Spec rows:\s+0/);
});
