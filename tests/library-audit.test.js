import test from "node:test";
import { execaSync } from "execa";
import path from "node:path";

test("library audit passes on committed tree", () => {
  execaSync("yarn", ["library:audit"], { cwd: path.resolve(".") });
});
