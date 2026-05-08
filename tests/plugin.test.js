import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

test("plugin install supports global-path override", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "haus-plugin-"));
  execSync(`HAUS_PLUGIN_DIR="${tmp}" node dist/cli.js plugin install`, { stdio: "pipe" });
  assert.equal(existsSync(path.join(tmp, ".claude-plugin", "plugin.json")), true);
});
