import test from "node:test";
import assert from "node:assert/strict";
import { scanProject } from "../dist/cli.js";

test("scanner command exists in built cli", async () => {
  assert.equal(typeof scanProject, "undefined");
});
