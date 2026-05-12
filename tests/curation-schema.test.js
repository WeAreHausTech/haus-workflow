import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

const repoRoot = path.resolve(".");

function runValidator(tempDir, expectFailure) {
  const env = {
    ...process.env,
    HAUS_SOURCE_DECISIONS_PATH: path.join(tempDir, "library/curation/source-decisions.json"),
    HAUS_SOURCES_PATH: path.join(tempDir, "library/catalog/sources.yaml")
  };
  let failed = false;
  try {
    execaSync("yarn", ["tsx", "scripts/validate-source-decisions.ts"], { cwd: repoRoot, env });
  } catch {
    failed = true;
  }
  assert.equal(failed, expectFailure);
}

function writeMinimalCurationTemp() {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-curation-"));
  mkdirSync(path.join(temp, "library/curation"), { recursive: true });
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });
  writeFileSync(
    path.join(temp, "library/catalog/sources.yaml"),
    `sources:
  - id: demo
    url: https://example.com
    policy: candidate-only
    status: candidate
    pinnedVersion: "2026-01-01"
    pinnedHash: "sha256-demo"
    license: unknown
    unsafeHookCommands: []
`
  );
  return temp;
}

test("source decisions validator passes for committed curation file", () => {
  execaSync("yarn", ["sources:decisions"], { cwd: repoRoot });
});

test("source decisions validator rejects copied=true accepted idea", () => {
  const temp = writeMinimalCurationTemp();
  writeFileSync(
    path.join(temp, "library/curation/source-decisions.json"),
    JSON.stringify(
      {
        decisions: [
          {
            source: "demo",
            ideasAccepted: [
              {
                idea: "token budgeting",
                target: "haus-context-router",
                reason: "minimal context",
                copied: true,
                maintenanceRisk: "low",
                licenseAttributionConcern: "low",
                productFit: "strong"
              }
            ],
            ideasRejected: []
          }
        ]
      },
      null,
      2
    )
  );
  runValidator(temp, true);
});

test("source decisions validator allows JavaScript mention without bare java token", () => {
  const temp = writeMinimalCurationTemp();
  writeFileSync(
    path.join(temp, "library/curation/source-decisions.json"),
    JSON.stringify(
      {
        decisions: [
          {
            source: "demo",
            ideasAccepted: [
              {
                idea: "Prefer TypeScript and JavaScript for web clients",
                target: "docs/curation.md",
                reason: "JavaScript appears as part of a normal Haus stack sentence.",
                copied: false,
                maintenanceRisk: "low",
                licenseAttributionConcern: "low",
                productFit: "strong"
              }
            ],
            ideasRejected: []
          }
        ]
      },
      null,
      2
    )
  );
  runValidator(temp, false);
});

test("source decisions validator rejects bare Java stack token in accepted idea", () => {
  const temp = writeMinimalCurationTemp();
  writeFileSync(
    path.join(temp, "library/curation/source-decisions.json"),
    JSON.stringify(
      {
        decisions: [
          {
            source: "demo",
            ideasAccepted: [
              {
                idea: "Adopt Java for all services",
                target: "docs/curation.md",
                reason: "Unsupported stack signal in accepted row.",
                copied: false,
                maintenanceRisk: "low",
                licenseAttributionConcern: "low",
                productFit: "strong"
              }
            ],
            ideasRejected: []
          }
        ]
      },
      null,
      2
    )
  );
  runValidator(temp, true);
});
