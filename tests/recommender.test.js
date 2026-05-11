import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

test("recommender writes recommendation json shape", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-rec-rootless-"));
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "rec-rootless", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  writeFileSync(
    path.join(temp, "library/catalog/manifest.json"),
    JSON.stringify(
      {
        items: [{ id: "haus.react19-patterns", type: "skill", source: "haus", version: "1", path: "none", tags: ["react19"], repoRoles: ["react-app"], tokenEstimate: 100 }]
      },
      null,
      2
    )
  );
  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  execSync(`node "${path.resolve("dist/cli.js")}" recommend --json > /dev/null`, { cwd: temp });
  const file = path.join(temp, ".haus-ai/recommendation.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const hooks = JSON.parse(fs.readFileSync(path.join(temp, ".haus-ai/recommended-hooks.json"), "utf8"));
  const rules = JSON.parse(fs.readFileSync(path.join(temp, ".haus-ai/recommended-rules.json"), "utf8"));
  assert.equal(Array.isArray(parsed.recommended), true);
  assert.equal(Array.isArray(parsed.skipped), true);
  assert.equal(typeof parsed.estimatedContextTokens, "number");
  assert.equal(Array.isArray(hooks), true);
  assert.equal(Array.isArray(rules), true);
});

test("unsupported stacks are skipped by policy", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-rec-"));
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });
  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "tmp", packageManager: "yarn@4.5.3" }, null, 2));
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  writeFileSync(
    path.join(temp, "library/catalog/manifest.json"),
    JSON.stringify(
      {
        items: [
          { id: "x.python-skill", type: "skill", source: "haus", version: "1", path: "none", tags: ["python"], repoRoles: [], tokenEstimate: 1 }
        ]
      },
      null,
      2
    )
  );
  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  execSync(`node "${path.resolve("dist/cli.js")}" recommend --json > /dev/null`, { cwd: temp });
  const recommendation = JSON.parse(fs.readFileSync(path.join(temp, ".haus-ai/recommendation.json"), "utf8"));
  assert.equal(recommendation.recommended.length, 0);
  assert.equal(recommendation.skipped.some((x) => String(x.reason).includes("Unsupported stack policy")), true);
});

test("recommend merges securityRisks into warnings", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-rec-sec-"));
  mkdirSync(path.join(temp, ".haus-ai"), { recursive: true });
  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "sec-rec", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2));
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  const context = {
    mode: "fast",
    generatedAt: new Date().toISOString(),
    root: temp,
    repoName: "sec-rec",
    packageManager: "yarn",
    repoRoles: ["react-app"],
    confidence: 0.9,
    detectedStacks: {
      frontend: ["react19"],
      backend: [],
      databases: [],
      testing: [],
      auth: [],
      tooling: [],
      packageManagers: ["yarn4"]
    },
    dependencies: ["react"],
    securityRisks: ["Missing env template"],
    crossRepoHints: [],
    warnings: ["No package.json test script found"]
  };
  writeFileSync(path.join(temp, ".haus-ai/context-map.json"), JSON.stringify(context, null, 2));
  execSync(`node "${path.resolve("dist/cli.js")}" recommend --json > /dev/null`, { cwd: temp });
  const recommendation = JSON.parse(fs.readFileSync(path.join(temp, ".haus-ai/recommendation.json"), "utf8"));
  const joined = recommendation.warnings.join(" | ");
  assert.equal(joined.includes("Scan reported security signals"), true);
  assert.equal(joined.includes("Missing env template"), true);
});
