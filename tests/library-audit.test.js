import test from "node:test";
import assert from "node:assert/strict";
import { execaSync } from "execa";
import path from "path";

test("library audit passes on committed tree", () => {
  execaSync("yarn", ["library:audit"], { cwd: path.resolve(".") });
});
