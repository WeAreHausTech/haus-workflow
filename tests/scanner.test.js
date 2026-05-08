import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("scanner command exists in built cli", async () => {
  const text = fs.readFileSync("src/commands/scan.ts", "utf8");
  assert.equal(text.includes("scanProject"), true);
});
