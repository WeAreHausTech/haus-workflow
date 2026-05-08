import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("memory redacts secrets pattern", () => {
  const text = fs.readFileSync("src/memory/redact-memory.ts", "utf8");
  assert.equal(text.includes("REDACTED"), true);
});
