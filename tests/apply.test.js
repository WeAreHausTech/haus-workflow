import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("generated settings uses haus command", () => {
  const text = fs.readFileSync("src/claude/write-claude-files.ts", "utf8");
  assert.equal(text.includes("haus-ai"), false);
  assert.equal(text.includes("haus context --from-hook"), true);
});
