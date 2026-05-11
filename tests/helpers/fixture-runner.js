import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function cliPath() {
  return path.resolve("dist/cli.js");
}

export function cloneFixtureToTemp(fixtureName) {
  const fixtureRoot = path.resolve("tests/fixtures/repos", fixtureName);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-fixture-${fixtureName}-`));
  fs.cpSync(fixtureRoot, temp, { recursive: true });
  return temp;
}

export function runHaus(cwd, command) {
  return execSync(`node "${cliPath()}" ${command}`, { cwd, encoding: "utf8" });
}

export function readHausJson(cwd, fileName) {
  const file = path.join(cwd, ".haus-ai", fileName);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function normalizeRecommendationForGolden(recommendation) {
  const recommended = [...(recommendation.recommended ?? [])]
    .map((item) => ({
      id: item.id,
      type: item.type,
      confidence: item.confidence,
      confidenceLevel: item.confidenceLevel,
      reason: item.reason,
      reasons: [...(item.reasons ?? [])].sort((a, b) => a.code.localeCompare(b.code))
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const skipped = [...(recommendation.skipped ?? [])]
    .map((item) => ({
      id: item.id,
      reason: item.reason,
      skipReasons: [...(item.skipReasons ?? [])].sort((a, b) => a.code.localeCompare(b.code))
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    mode: recommendation.mode,
    estimatedContextTokens: recommendation.estimatedContextTokens,
    selectedRules: recommendation.selectedRules,
    skippedRules: recommendation.skippedRules,
    estimatedTokenReductionPct: recommendation.estimatedTokenReductionPct,
    recommended,
    skipped,
    warnings: [...(recommendation.warnings ?? [])].sort()
  };
}

export function normalizeContextForGolden(context) {
  return {
    mode: context.mode,
    packageManager: context.packageManager,
    repoRoles: [...(context.repoRoles ?? [])].sort(),
    confidence: context.confidence,
    detectedStacks: Object.fromEntries(
      Object.entries(context.detectedStacks ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, [...value].sort()])
    ),
    dependencies: [...(context.dependencies ?? [])].sort(),
    securityRisks: [...(context.securityRisks ?? [])].sort(),
    crossRepoHints: [...(context.crossRepoHints ?? [])].sort(),
    warnings: [...(context.warnings ?? [])].sort()
  };
}
