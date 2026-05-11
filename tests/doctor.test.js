import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

test("doctor reports hooks OK after apply", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-doctor-"));
  mkdirSync(path.join(temp, "plugin"), { recursive: true });
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "doc-temp", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");

  const cli = path.resolve("dist/cli.js");
  assert.equal(spawnSync("node", [cli, "scan", "--json"], { cwd: temp, encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [cli, "recommend", "--json"], { cwd: temp, encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [cli, "apply", "--write"], { cwd: temp, encoding: "utf8" }).status, 0);

  const r = spawnSync("node", [cli, "doctor"], { cwd: temp, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal((r.stdout ?? "").includes("HOOKS OK"), true);
});

test("doctor --hooks fails when settings missing", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-doctor-hooks-miss-"));
  const cli = path.resolve("dist/cli.js");
  const r = spawnSync("node", [cli, "doctor", "--hooks"], { cwd: temp, encoding: "utf8" });
  assert.equal(r.status, 1);
  const out = `${r.stderr ?? ""}${r.stdout ?? ""}`;
  assert.equal(out.includes("doctor --hooks") || out.includes("settings"), true);
});

test("doctor --hooks passes after apply", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-doctor-hooks-ok-"));
  mkdirSync(path.join(temp, "plugin"), { recursive: true });
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "dh-temp", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  const cli = path.resolve("dist/cli.js");
  spawnSync("node", [cli, "scan", "--json"], { cwd: temp, encoding: "utf8" });
  spawnSync("node", [cli, "recommend", "--json"], { cwd: temp, encoding: "utf8" });
  spawnSync("node", [cli, "apply", "--write"], { cwd: temp, encoding: "utf8" });
  const r = spawnSync("node", [cli, "doctor", "--hooks"], { cwd: temp, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal((r.stdout ?? "").includes("matches plugin hook contract"), true);
});
