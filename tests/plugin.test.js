import test from "node:test";
import assert from "node:assert/strict";
import { execaSync } from "execa";

test("plugin validate passes with correct plugin structure", () => {
  const result = execaSync("node", ["dist/cli.js", "plugin", "validate"], { reject: false });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.includes("validate passed"), true);
});
