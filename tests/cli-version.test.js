import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test("cli --version matches package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const cli = path.resolve("dist/cli.js");
  const r = spawnSync("node", [cli, "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal((r.stdout ?? "").trim(), pkg.version);
});
