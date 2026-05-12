import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

test("sources audit fails for unsupported source stacks", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-sources-"));
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });
  writeFileSync(
    path.join(temp, "library/catalog/sources.yaml"),
    `sources:
  - id: bad-source
    url: https://example.com/repo
    policy: candidate-only
    status: candidate
    pinnedVersion: "2026-01-01"
    pinnedHash: "sha256-x"
    license: MIT
    containsStacks: ["python"]
    unsafeHookCommands: []
`
  );
  let failed = false;
  try {
    execaSync("node", [path.resolve("dist/cli.js"), "sources", "audit"], { cwd: temp });
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
});
