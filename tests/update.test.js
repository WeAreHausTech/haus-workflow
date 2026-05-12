import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { execaSync } from "execa";

test("update check and apply create backup", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-update-"));
  mkdirSync(path.join(temp, ".haus-ai"), { recursive: true });
  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "update-temp", packageManager: "yarn@4.5.3" }, null, 2));
  writeFileSync(path.join(temp, ".haus-ai/haus.lock.json"), JSON.stringify([{ id: "x", type: "skill", source: "haus", version: "0.2.0", hash: "sha256-old", installMode: "copied", paths: [] }], null, 2));

  const checkOut = execaSync("node", [path.resolve("dist/cli.js"), "update", "--check"], { cwd: temp }).stdout;
  assert.equal(checkOut.includes("\"ok\""), true);

  const out = execaSync("node", [path.resolve("dist/cli.js"), "update"], { cwd: temp }).stdout;
  const backups = readdirSync(path.join(temp, ".haus-ai/backups"));
  const lock = JSON.parse(readFileSync(path.join(temp, ".haus-ai/haus.lock.json"), "utf8"));

  assert.equal(backups.length > 0, true);
  assert.equal(typeof lock[0].hash, "string");
  assert.equal(lock[0].hash.startsWith("sha256-"), true);
  assert.equal(Array.isArray(lock[0].paths), true);
  assert.equal(out.includes("Lock item changes") || out.includes("Lock changed:") || out.includes("No lockfile changes."), true);
});

test("update recomputes hash from tracked file paths", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-update-paths-"));
  mkdirSync(path.join(temp, ".haus-ai"), { recursive: true });
  mkdirSync(path.join(temp, ".claude"), { recursive: true });
  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "update-paths", packageManager: "yarn@4.5.3" }, null, 2));
  writeFileSync(path.join(temp, ".claude/tracked.md"), "content-v1");
  writeFileSync(
    path.join(temp, ".haus-ai/haus.lock.json"),
    JSON.stringify(
      [{ id: "x", type: "skill", source: "haus", version: "0.1.0", hash: "sha256-stale", installMode: "copied", paths: [".claude/tracked.md"] }],
      null,
      2
    )
  );

  execaSync("node", [path.resolve("dist/cli.js"), "update"], { cwd: temp });
  const lock1 = JSON.parse(readFileSync(path.join(temp, ".haus-ai/haus.lock.json"), "utf8"));
  const h1 = lock1[0].hash;
  assert.equal(h1.startsWith("sha256-"), true);
  assert.notEqual(h1, "sha256-stale");

  writeFileSync(path.join(temp, ".claude/tracked.md"), "content-v2");
  execaSync("node", [path.resolve("dist/cli.js"), "update"], { cwd: temp });
  const lock2 = JSON.parse(readFileSync(path.join(temp, ".haus-ai/haus.lock.json"), "utf8"));
  assert.notEqual(lock2[0].hash, h1);
});
