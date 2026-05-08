import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";

test("scanner command exists in built cli", async () => {
  execSync("node dist/cli.js scan --json > /dev/null");
  const parsed = JSON.parse(fs.readFileSync(".haus-ai/context-map.json", "utf8"));
  assert.equal(typeof parsed.repoName, "string");
  assert.equal(Array.isArray(parsed.repoRoles), true);
  assert.equal(typeof parsed.confidence, "number");
});
