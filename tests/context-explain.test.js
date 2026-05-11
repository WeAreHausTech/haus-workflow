import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cloneFixtureToTemp,
  runHaus
} from "./helpers/fixture-runner.js";

test("explain-context renders recommendation JSON without recomputation", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-context --json");
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed.selected), true);
  assert.equal(Array.isArray(parsed.skipped), true);
  assert.equal(typeof parsed.stats.selectedRules, "number");
  assert.equal(parsed.selected.some((item) => item.id === "haus.vendure-plugin-patterns"), true);
  assert.equal(parsed.selected.some((item) => item.id === "haus.global-engineering-rules" && item.selectionMode === "baseline"), true);
});

test("explain-recommendation returns stable JSON", () => {
  const cwd = cloneFixtureToTemp("nextjs-app");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-recommendation --json");
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed.selected), true);
  assert.equal(parsed.selected.some((item) => item.id === "haus.nextjs-patterns"), true);
});

test("context --task --json returns task-scoped selected rules", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "context --task \"create vendure shipping plugin\" --json");
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed.selectedRules), true);
  assert.equal(parsed.selectedRules.some((item) => item.id === "haus.vendure-plugin-patterns"), true);
  assert.equal(parsed.selectedRules.some((item) => item.id === "haus.nextjs-patterns"), false);
  assert.equal(parsed.selectedRules.some((item) => item.selectionMode === "baseline"), false);
});

test("legacy recommendation schema does not crash explain/context", () => {
  const cwd = cloneFixtureToTemp("nextjs-app");
  runHaus(cwd, "scan --json");
  fs.mkdirSync(path.join(cwd, ".haus-ai"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".haus-ai/recommendation.json"),
    JSON.stringify(
      {
        mode: "fast",
        recommended: [{ id: "legacy.rule", type: "skill", reason: "legacy reason", confidence: 0.2, install: true }],
        skipped: [{ id: "legacy.skipped", reason: "legacy skip" }],
        warnings: [],
        estimatedContextTokens: 320
      },
      null,
      2
    )
  );

  const explainOutput = runHaus(cwd, "explain-recommendation --json");
  const explainParsed = JSON.parse(explainOutput);
  assert.equal(explainParsed.selected[0].reasons[0], "legacy reason");

  const contextOutput = runHaus(cwd, "context --task \"legacy\" --json");
  const contextParsed = JSON.parse(contextOutput);
  assert.equal(contextParsed.selectedRules.some((item) => item.id === "legacy.rule"), true);
});
