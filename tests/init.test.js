import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

test("haus init skips setup when .haus-workflow already exists", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-init-"));
  mkdirSync(path.join(temp, ".haus-workflow"), { recursive: true });
  const result = execaSync("node", [path.resolve("dist/cli.js"), "init"], { cwd: temp, reject: false });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.includes("already initialized"), true);
  assert.equal(result.stdout.includes("setup-project"), true);
});

test("haus init runs setup when .haus-workflow is missing", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-init-fresh-"));
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "init-test", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  const result = execaSync(
    "node",
    [path.resolve("dist/cli.js"), "init", "--fast", "--json"],
    { cwd: temp, reject: false }
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.includes("Initializing"), true);
  assert.equal(existsSync(path.join(temp, ".haus-workflow", "context-map.json")), true);
});
