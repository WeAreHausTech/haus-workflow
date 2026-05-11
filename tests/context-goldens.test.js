import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cloneFixtureToTemp, runHaus } from "./helpers/fixture-runner.js";

const goldenDir = path.resolve("tests/golden/context");
const goldenFiles = fs
  .readdirSync(goldenDir)
  .filter((file) => file.endsWith(".json"))
  .sort();

for (const goldenFile of goldenFiles) {
  const fixtureName = goldenFile.replace(/\.json$/, "");
  const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, goldenFile), "utf8"));
  for (const [task, expectation] of Object.entries(golden.tasks)) {
    test(`context golden: ${fixtureName} :: ${task}`, () => {
      const cwd = cloneFixtureToTemp(fixtureName);
      runHaus(cwd, "scan --json");
      runHaus(cwd, "recommend --json");
      const output = runHaus(cwd, `context --task "${task}" --json`);
      const parsed = JSON.parse(output);

      if (expectation.expectedTaskIntents) {
        for (const intent of expectation.expectedTaskIntents) {
          assert.equal(
            parsed.taskIntents.includes(intent),
            true,
            `expected task intent '${intent}' for task '${task}', got: ${JSON.stringify(parsed.taskIntents)}`
          );
        }
      }

      for (const expectedId of expectation.expectedSelectedIds ?? []) {
        assert.equal(
          parsed.selectedRules.some((rule) => rule.id === expectedId),
          true,
          `expected selected '${expectedId}' for task '${task}', got: ${parsed.selectedRules.map((r) => r.id).join(", ")}`
        );
      }

      for (const forbiddenId of expectation.forbiddenSelectedIds ?? []) {
        assert.equal(
          parsed.selectedRules.some((rule) => rule.id === forbiddenId),
          false,
          `forbidden '${forbiddenId}' must not appear for task '${task}', got: ${parsed.selectedRules.map((r) => r.id).join(", ")}`
        );
      }

      if (expectation.forbidBaseline) {
        assert.equal(
          parsed.selectedRules.some((rule) => rule.selectionMode === "baseline"),
          false,
          `task '${task}' must not include baseline rules`
        );
      }
    });
  }
}
