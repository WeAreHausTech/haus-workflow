import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

test("undo --yes removes .claude and .haus-ai", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-undo-"));
  mkdirSync(path.join(temp, ".claude"), { recursive: true });
  mkdirSync(path.join(temp, ".haus-ai"), { recursive: true });
  writeFileSync(path.join(temp, ".claude/settings.json"), "{}");
  writeFileSync(path.join(temp, ".haus-ai/context-map.json"), "{}");
  const cli = path.resolve("dist/cli.js");
  const r = execaSync("node", [cli, "undo", "--yes"], { cwd: temp, reject: false });
  assert.equal(r.exitCode, 0);
  assert.equal(fs.existsSync(path.join(temp, ".claude")), false);
  assert.equal(fs.existsSync(path.join(temp, ".haus-ai")), false);
});

test("undo noop when dirs missing", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-undo-empty-"));
  const cli = path.resolve("dist/cli.js");
  const r = execaSync("node", [cli, "undo", "--yes"], { cwd: temp, reject: false });
  assert.equal(r.exitCode, 0);
  assert.equal((r.stdout ?? "").includes("Nothing to remove"), true);
});
