import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

process.env.HAUS_FIXTURE_CATALOG = path.resolve("tests/fixtures/catalog/manifest.json");

import {
  cloneFixtureToTemp,
  normalizeContextForGolden,
  readHausJson,
  runHaus
} from "./helpers/fixture-runner.js";

const fixtures = [
  "vendure-monorepo",
  "nextjs-app",
  "nest-graphql-api",
  "laravel-app",
  "wordpress-bedrock-site",
  "turbo-monorepo",
  "nx-workspace"
];

for (const fixtureName of fixtures) {
  test(`scan golden: ${fixtureName}`, () => {
    const cwd = cloneFixtureToTemp(fixtureName);
    runHaus(cwd, "scan --json");

    const context = readHausJson(cwd, "context-map.json");
    const normalized = normalizeContextForGolden(context);
    const goldenPath = path.resolve("tests/golden/scans", `${fixtureName}.json`);
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
    assert.deepEqual(normalized, golden);
  });
}
