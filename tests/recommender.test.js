import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

test("recommender writes recommendation json shape", () => {
  execSync("node dist/cli.js scan --json > /dev/null");
  execSync("node dist/cli.js recommend --json > /dev/null");
  const file = ".haus-ai/recommendation.json";
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const hooks = JSON.parse(fs.readFileSync(".haus-ai/recommended-hooks.json", "utf8"));
  const rules = JSON.parse(fs.readFileSync(".haus-ai/recommended-rules.json", "utf8"));
  assert.equal(Array.isArray(parsed.recommended), true);
  assert.equal(Array.isArray(parsed.skipped), true);
  assert.equal(typeof parsed.estimatedContextTokens, "number");
  assert.equal(Array.isArray(hooks), true);
  assert.equal(Array.isArray(rules), true);
});
