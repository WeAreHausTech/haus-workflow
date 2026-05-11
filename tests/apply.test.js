import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";

test("generated settings uses haus command", () => {
  const combined = [
    fs.readFileSync("src/claude/write-claude-files.ts", "utf8"),
    fs.readFileSync("src/claude/load-hooks.ts", "utf8")
  ].join("\n");
  assert.equal(/haus-ai\s+(doctor|context|guard|apply)/.test(combined), false);
  assert.equal(combined.includes("haus context --from-hook"), true);
});

test("apply writes claude files and rules", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-apply-"));
  mkdirSync(path.join(temp, "plugin"), { recursive: true });
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "apply-temp", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");

  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  execSync(`node "${path.resolve("dist/cli.js")}" recommend --json > /dev/null`, { cwd: temp });
  execSync(`node "${path.resolve("dist/cli.js")}" apply --write > /dev/null`, { cwd: temp });

  const settings = JSON.parse(readFileSync(path.join(temp, ".claude/settings.json"), "utf8"));
  const rulesHaus = readFileSync(path.join(temp, ".claude/rules/haus.md"), "utf8");
  const rulesSecurity = readFileSync(path.join(temp, ".claude/rules/security.md"), "utf8");

  const ups = settings.hooks.UserPromptSubmit[0].hooks;
  assert.equal(ups.length, 2);
  assert.equal(ups[0].command, "haus context --from-hook");
  assert.equal(ups[1].command, "haus memory inject --from-hook");
  const pre = settings.hooks.PreToolUse;
  assert.equal(pre[0].matcher, "Read|Edit|Write");
  assert.equal(pre[0].hooks[0].command, "haus guard file-access --from-hook");
  assert.equal(pre[1].matcher, "Bash");
  assert.equal(pre[1].hooks[0].command, "haus guard bash --from-hook");
  assert.equal(rulesHaus.includes("Keep context minimal"), true);
  assert.equal(rulesSecurity.includes("Never read secrets"), true);

  const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.join(temp, ".haus-ai/haus.lock.json"), "utf8"));
  assert.equal(Array.isArray(lock), true);
  assert.equal(lock.length > 0, true);
  for (const row of lock) {
    assert.equal(row.version, pkg.version);
    assert.equal(row.hash.startsWith("sha256-"), true);
  }
});
