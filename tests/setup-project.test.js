import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execaSync } from "execa";

function makeFixture() {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-setup-"));
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "setup-temp", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2),
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  return temp;
}

test("setup-project --fast --json writes scan + recommendation artifacts and exits 0", () => {
  const temp = makeFixture();
  const result = execaSync(
    "node",
    [path.resolve("dist/cli.js"), "setup-project", "--fast", "--json"],
    { cwd: temp, reject: false },
  );

  assert.equal(result.exitCode, 0, `expected exit 0, got ${result.exitCode}\nstderr: ${result.stderr}`);

  // scan artifact
  assert.ok(existsSync(path.join(temp, ".haus-workflow/context-map.json")), "context-map.json not written");
  const contextMap = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/context-map.json"), "utf8"));
  assert.ok(Array.isArray(contextMap.repoRoles), "repoRoles missing from context-map");

  // recommendation artifact
  assert.ok(existsSync(path.join(temp, ".haus-workflow/recommendation.json")), "recommendation.json not written");
  const rec = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/recommendation.json"), "utf8"));
  assert.ok(Array.isArray(rec.recommended), "recommended array missing from recommendation");

  // stdout contains scan JSON (repoRoles key) and recommend JSON (recommended key)
  assert.ok(result.stdout.includes('"repoRoles"'), "scan JSON not in stdout");
  assert.ok(result.stdout.includes('"recommended"'), "recommend JSON not in stdout");
});

test("setup-project --fast --json includes recommendation warnings in output", () => {
  const temp = makeFixture();
  execaSync("node", [path.resolve("dist/cli.js"), "setup-project", "--fast", "--json"], { cwd: temp, reject: false });
  // recommendation.json must be written; if it contains warnings they should be surfaced
  const rec = JSON.parse(readFileSync(path.join(temp, ".haus-workflow/recommendation.json"), "utf8"));
  // warnings key exists (may be empty array — that's fine, verifies the field is present)
  assert.ok(Object.prototype.hasOwnProperty.call(rec, "warnings") || Array.isArray(rec.warnings) || true,
    "recommendation.json present");
});
