import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, mkdirSync } from "node:fs";
import { execaSync } from "execa";

test("haus init skips setup when .haus-ai already exists", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-init-"));
  mkdirSync(path.join(temp, ".haus-ai"), { recursive: true });
  const result = execaSync("node", [path.resolve("dist/cli.js"), "init"], { cwd: temp, reject: false });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.includes("already initialized"), true);
  assert.equal(result.stdout.includes("setup-project"), true);
});
