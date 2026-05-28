import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execaSync } from "execa";

const cli = path.resolve("dist/cli.js");

function makeProject(prefix, pkgExtra = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), `haus-${prefix}-`));
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: prefix, packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" }, ...pkgExtra }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  return temp;
}

test("apply --select errors when stdin is not a TTY", () => {
  // In execaSync, stdin is piped (not a TTY) — this should trigger the error path.
  const temp = makeProject("sel-notty");
  mkdirSync(path.join(temp, ".haus-workflow"), { recursive: true });
  writeFileSync(
    path.join(temp, ".haus-workflow/recommendation.json"),
    JSON.stringify({ mode: "fast", recommended: [], skipped: [], warnings: [] }, null, 2)
  );
  const r = execaSync("node", [cli, "apply", "--select", "--write"], { cwd: temp, reject: false });
  assert.equal(r.exitCode, 1);
  const out = (r.stderr ?? "") + (r.stdout ?? "");
  assert.equal(
    out.toLowerCase().includes("tty") || out.toLowerCase().includes("interactive"),
    true,
    `expected TTY/interactive error message, got: ${out}`
  );
});

test("apply --select is recognised by the CLI (no unknown option error)", () => {
  // Check the flag is registered. With no recommendation.json the error should
  // be about TTY, not "unknown option --select".
  const temp = makeProject("sel-registered");
  const r = execaSync("node", [cli, "apply", "--select", "--write"], { cwd: temp, reject: false });
  const out = (r.stderr ?? "") + (r.stdout ?? "");
  assert.equal(out.includes("unknown option"), false, `unexpected "unknown option" in: ${out}`);
});

test("writeClaudeFiles selectedIds: directly exercises the filtering code path via tsx", async () => {
  // Uses `node --import tsx/esm` to import writeClaudeFiles from source and call it
  // with explicit selectedIds, verifying the selectedIds !== undefined branch is hit.
  const temp = makeProject("sel-filter-direct");
  const env = { ...process.env, HAUS_FIXTURE_CATALOG: path.resolve("tests/fixtures/catalog/manifest.json") };
  execaSync("node", [cli, "scan", "--json"], { cwd: temp, env });
  execaSync("node", [cli, "recommend", "--json"], { cwd: temp, env });

  const rec = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/recommendation.json"), "utf8"));
  const allItems = rec.recommended ?? [];

  // Write a small inline script that calls writeClaudeFiles with selectedIds=[].
  // This directly exercises the `selectedIds !== undefined` branch.
  const helperPath = path.join(temp, "run-write.mts");
  const srcPath = path.resolve("src/claude/write-claude-files.ts").replace(/\\/g, "/");
  writeFileSync(
    helperPath,
    [
      `import { writeClaudeFiles } from "${srcPath}";`,
      `const root = process.argv[2];`,
      `const selectedIds = JSON.parse(process.argv[3]);`,
      `await writeClaudeFiles(root, false, selectedIds);`,
    ].join("\n")
  );

  // Run with selectedIds=[] — should write core files but empty lockfile.
  execaSync("node", ["--import", "tsx/esm", helperPath, temp, "[]"], {
    cwd: path.resolve("."),
    reject: true,
    env,
  });

  const lockEmpty = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/haus.lock.json"), "utf8"));
  assert.equal(lockEmpty.length, 0, `expected empty lock with selectedIds=[], got ${lockEmpty.length}`);
  // Core files written regardless of selectedIds.
  assert.equal(existsSync(path.join(temp, ".claude/rules/haus.md")), true);
  assert.equal(existsSync(path.join(temp, ".claude/settings.json")), true);

  // Now run with selectedIds=[firstItem.id] — lock should have exactly that one entry.
  if (allItems.length > 0) {
    const oneId = allItems[0].id;
    execaSync("node", ["--import", "tsx/esm", helperPath, temp, JSON.stringify([oneId])], {
      cwd: path.resolve("."),
      reject: true,
      env,
    });
    const lockOne = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/haus.lock.json"), "utf8"));
    assert.equal(lockOne.length, 1, `expected 1 lock entry for selectedIds=[${oneId}], got ${lockOne.length}`);
    assert.equal(lockOne[0].id, oneId);
  }
});
