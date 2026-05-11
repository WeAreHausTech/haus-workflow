import test from "node:test";
import assert from "node:assert/strict";
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
});
