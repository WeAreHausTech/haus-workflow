import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { execaSync } from "execa";

test("generated claude primitives stay compact routers", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "haus-generated-"));
  execaSync("node", [path.resolve("dist/cli.js"), "scan", "--json"], { cwd });
  execaSync("node", [path.resolve("dist/cli.js"), "recommend", "--json"], { cwd });
  execaSync("node", [path.resolve("dist/cli.js"), "apply", "--write"], { cwd });

  const claudemd = fs.readFileSync(path.join(cwd, ".claude/CLAUDE.md"), "utf8");
  const ruleHaus = fs.readFileSync(path.join(cwd, ".claude/rules/haus.md"), "utf8");
  const cmdDoctor = fs.readFileSync(path.join(cwd, ".claude/commands/haus-doctor.md"), "utf8");

  assert.equal(claudemd.length < 1200, true, "CLAUDE.md should stay tiny");
  assert.equal(ruleHaus.length < 400, true, "haus rule should stay compact");
  assert.equal(cmdDoctor.length < 200, true, "command router should stay compact");
});
