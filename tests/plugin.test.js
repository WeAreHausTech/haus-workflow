import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, existsSync } from "node:fs";
import { execaSync } from "execa";

test("plugin install supports global-path override", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "haus-plugin-"));
  execaSync("node", ["dist/cli.js", "plugin", "install"], { env: { ...process.env, HAUS_PLUGIN_DIR: tmp } });
  assert.equal(existsSync(path.join(tmp, ".claude-plugin", "plugin.json")), true);
});
