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

test("writeClaudeFiles selectedIds filter: empty selection skips catalog items but writes core files", () => {
  // Run a full apply to get a project with lock entries, then test that running
  // a helper script that calls writeClaudeFiles with selectedIds=[] writes zero
  // catalog items to the lock.
  const temp = makeProject("sel-filter");
  execaSync("node", [cli, "scan", "--json"], { cwd: temp });
  execaSync("node", [cli, "recommend", "--json"], { cwd: temp });

  // Read recommendation to find catalog items.
  const rec = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/recommendation.json"), "utf8"));
  const allItems = rec.recommended ?? [];

  // Can't import internals from the single-bundle dist. Use approach: apply all, then
  // re-apply with a trimmed recommendation.json (0 items) and verify lock reflects it.
  // This mirrors the real --select behaviour where selectedIds drives filtering.

  // First apply: gets all recommended items.
  execaSync("node", [cli, "apply", "--write"], { cwd: temp });

  // Trim recommendation to zero catalog items, re-apply, check lock empties.
  writeFileSync(
    path.join(temp, ".haus-workflow/recommendation.json"),
    JSON.stringify({ ...rec, recommended: [] }, null, 2)
  );
  execaSync("node", [cli, "apply", "--write"], { cwd: temp });
  const lockEmpty = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/haus.lock.json"), "utf8"));

  // lockAll may have items if catalog items exist; lockEmpty must have none.
  assert.equal(lockEmpty.length, 0, `expected empty lock after zero-item recommendation, got ${lockEmpty.length}`);
  // Core files still exist regardless.
  assert.equal(existsSync(path.join(temp, ".claude/rules/haus.md")), true);
  assert.equal(existsSync(path.join(temp, ".claude/settings.json")), true);

  // Restore one item to verify partial selection.
  if (allItems.length > 0) {
    const oneItem = allItems[0];
    writeFileSync(
      path.join(temp, ".haus-workflow/recommendation.json"),
      JSON.stringify({ ...rec, recommended: [oneItem] }, null, 2)
    );
    execaSync("node", [cli, "apply", "--write"], { cwd: temp });
    const lockOne = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/haus.lock.json"), "utf8"));
    assert.equal(lockOne.length, 1, `expected 1 lock entry, got ${lockOne.length}`);
    assert.equal(lockOne[0].id, oneItem.id);
  }
});
