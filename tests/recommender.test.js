import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
  "nx-workspace"
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
      assert.equal(normalized.recommended.some((item) => item.id === expectedId), true);
    }
    for (const forbiddenId of golden.forbiddenSelectedIds) {
      assert.equal(normalized.recommended.some((item) => item.id === forbiddenId), false);
    }

    assert.equal(
      normalized.recommended.some((item) => item.reasons.some((reason) => reason.message.includes(golden.requiredPositiveReasonContains))),
      true
    );
    assert.equal(
      normalized.skipped.some((item) => item.skipReasons.some((reason) => reason.message.includes(golden.requiredSkipReasonContains))),
      true
    );
  });
}
