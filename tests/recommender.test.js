import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.HAUS_FIXTURE_CATALOG = path.resolve("tests/fixtures/catalog/manifest.json");

import {
  cloneFixtureToTemp,
  normalizeRecommendationForGolden,
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
  "nx-workspace",
  "laravel-with-react-frontend",
  "vendure-with-nextjs-storefront",
  "orphan-graphql-config",
  "wordpress-with-node-tooling"
];

for (const fixtureName of fixtures) {
  test(`recommendation golden: ${fixtureName}`, () => {
    const cwd = cloneFixtureToTemp(fixtureName);
    runHaus(cwd, "scan --json");
    runHaus(cwd, "recommend --json");

    const recommendation = readHausJson(cwd, "recommendation.json");
    const normalized = normalizeRecommendationForGolden(recommendation);
    const goldenPath = path.resolve("tests/golden/recommendations", `${fixtureName}.json`);
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

    for (const expectedId of golden.expectedSelectedIds) {
      assert.equal(normalized.recommended.some((item) => item.id === expectedId), true, `expected selected: ${expectedId}`);
    }
    for (const forbiddenId of golden.forbiddenSelectedIds) {
      assert.equal(normalized.recommended.some((item) => item.id === forbiddenId), false, `forbidden but selected: ${forbiddenId}`);
    }

    const positivePhrases = toArray(golden.requiredPositiveReasonContains);
    for (const phrase of positivePhrases) {
      assert.equal(
        normalized.recommended.some((item) => item.reasons.some((reason) => reason.message.includes(phrase))),
        true,
        `missing positive reason containing: ${phrase}`
      );
    }
    const skipPhrases = toArray(golden.requiredSkipReasonContains);
    for (const phrase of skipPhrases) {
      assert.equal(
        normalized.skipped.some((item) => item.skipReasons.some((reason) => reason.message.includes(phrase))),
        true,
        `missing skip reason containing: ${phrase}`
      );
    }

    if (golden.requireConfidenceForId) {
      for (const [id, level] of Object.entries(golden.requireConfidenceForId)) {
        const found = normalized.recommended.find((item) => item.id === id);
        assert.ok(found, `expected ${id} in recommended for confidence check`);
        assert.equal(found.confidenceLevel, level, `expected ${id} confidence ${level}, got ${found?.confidenceLevel}`);
      }
    }
  });
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}
