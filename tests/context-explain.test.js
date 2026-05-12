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

test("explain-recommendation preserves skip-reason signal metadata", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-recommendation --json");
  const parsed = JSON.parse(output);
  const laravelNova = parsed.skipped.find((item) => item.id === "haus.laravel-nova-patterns");
  assert.ok(laravelNova, "expected haus.laravel-nova-patterns in skipped list");
  assert.equal(Array.isArray(laravelNova.reasonDetails), true);
  assert.equal(
    laravelNova.reasonDetails.some((reason) => reason.code === "requires-any-unsatisfied" && reason.signal),
    true,
    "expected requires-any-unsatisfied skip reason with signal metadata"
  );
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

test("explain-recommendation human output groups Selected and Skipped with why + confidence", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-recommendation");
  assert.match(output, /^Recommendation explanation$/m);
  assert.match(output, /^Selected$/m);
  assert.match(output, /^Skipped$/m);
  assert.match(output, /confidence: (low|medium|high)/);
  assert.match(output, /^    why:$/m);
  assert.match(output, /haus\.vendure-plugin-patterns/);
});

test("explain-context --task human output renders task intents + Included/Excluded sections", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-context --task \"build shipping plugin\"");
  assert.match(output, /^Task: build shipping plugin$/m);
  assert.match(output, /^Task intents:$/m);
  assert.match(output, /^- backend$/m);
  assert.match(output, /^Included in task context$/m);
  assert.match(output, /^Excluded from task context$/m);
  assert.match(output, /haus\.vendure-plugin-patterns/);
  assert.match(output, /because: rule intents \[.*backend.*\] match task intents \[backend\]/);
  assert.match(output, /why excluded: baseline rules are excluded from task-scoped context/);
});

test("explain-context --task --json adds task fields without breaking legacy keys", () => {
  const cwd = cloneFixtureToTemp("vendure-monorepo");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-context --task \"build shipping plugin\" --json");
  const parsed = JSON.parse(output);
  assert.equal(Array.isArray(parsed.selected), true);
  assert.equal(Array.isArray(parsed.skipped), true);
  assert.equal(typeof parsed.stats.selectedRules, "number");
  assert.equal(parsed.task, "build shipping plugin");
  assert.deepEqual(parsed.taskIntents, ["backend"]);
  assert.equal(Array.isArray(parsed.repoSignals), true);
  assert.equal(parsed.includedInTask.some((rule) => rule.id === "haus.vendure-plugin-patterns"), true);
  assert.equal(parsed.excludedFromTask.some((rule) => rule.selectionMode === "baseline"), true);
});

test("explain-recommendation --json shape is unchanged", () => {
  const cwd = cloneFixtureToTemp("nextjs-app");
  runHaus(cwd, "scan --json");
  runHaus(cwd, "recommend --json");
  const output = runHaus(cwd, "explain-recommendation --json");
  const parsed = JSON.parse(output);
  assert.deepEqual(Object.keys(parsed).sort(), ["selected", "skipped", "stats"]);
  for (const item of parsed.selected) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ["confidence", "confidenceLevel", "id", "reasons", "selectionMode"]
    );
  }
  for (const item of parsed.skipped) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "reasonDetails", "reasons"]);
    assert.equal(Array.isArray(item.reasonDetails), true);
  }
  assert.deepEqual(
    Object.keys(parsed.stats).sort(),
    ["estimatedTokenReductionPct", "selectedRules", "skippedRules"]
  );
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
