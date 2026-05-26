import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execaSync } from "execa";

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
  const args = [];
  const tokenRegex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = tokenRegex.exec(command)) !== null) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }
  const result = execaSync("node", [cliPath(), ...args], { cwd });
  return result.stdout;
}

export function readHausJson(cwd, fileName) {
  const file = path.join(cwd, ".haus-workflow", fileName);
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
