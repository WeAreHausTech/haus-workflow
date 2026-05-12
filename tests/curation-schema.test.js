import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

test("source decisions validator passes for committed curation file", () => {
  execaSync("yarn", ["sources:decisions"], { cwd: path.resolve(".") });
});

test("source decisions validator rejects copied=true accepted idea", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-curation-"));
  mkdirSync(path.join(temp, "library/curation"), { recursive: true });
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });
  mkdirSync(path.join(temp, "scripts"), { recursive: true });

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

  writeFileSync(
    path.join(temp, "scripts/validate-source-decisions.ts"),
    fs.readFileSync(path.resolve("scripts/validate-source-decisions.ts"), "utf8")
  );

  let failed = false;
  try {
    execaSync("yarn", ["tsx", "scripts/validate-source-decisions.ts"], { cwd: temp });
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
});
