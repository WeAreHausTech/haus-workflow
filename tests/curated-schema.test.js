// HAUS-PRERELEASE-CLEANUP: P4b — covers library/curated/ deletion.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execaSync } from "execa";

const repoRoot = path.resolve(".");

// Run the audit script from tempDir so process.cwd() returns tempDir,
// but use tsx from repoRoot's node_modules since tempDir has no install.
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const auditScript = path.join(repoRoot, "scripts/audit-curated.ts");

function runCuratedAudit(tempDir, expectFailure) {
  let failed = false;
  try {
    execaSync(tsxBin, [auditScript], { cwd: tempDir });
  } catch {
    failed = true;
  }
  assert.equal(failed, expectFailure);
}

function scaffoldCuratedTemp(overrides = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-curated-"));
  mkdirSync(path.join(temp, "library/curated/inventory"), { recursive: true });
  mkdirSync(path.join(temp, "library/curated/decisions"), { recursive: true });
  mkdirSync(path.join(temp, "library/curated/external"), { recursive: true });
  mkdirSync(path.join(temp, "library/curated/wrappers"), { recursive: true });
  mkdirSync(path.join(temp, "library/catalog"), { recursive: true });

  // Copy schema files — the script (run from repoRoot/node_modules tsx) references these by path relative to cwd=tempDir
  fs.copyFileSync(
    path.join(repoRoot, "library/curated/inventory/source-inventory.schema.json"),
    path.join(temp, "library/curated/inventory/source-inventory.schema.json")
  );
  fs.copyFileSync(
    path.join(repoRoot, "library/curated/decisions/curation-decisions.schema.json"),
    path.join(temp, "library/curated/decisions/curation-decisions.schema.json")
  );

  // Minimal sources.yaml
  writeFileSync(
    path.join(temp, "library/catalog/sources.yaml"),
    `sources:
  - id: demo-source
    url: https://example.com
    policy: candidate-only
    status: candidate
    pinnedVersion: "2026-01-01"
    pinnedHash: "sha256-demo"
    license: unknown
    unsafeHookCommands: []
`
  );

  // Minimal manifest (no curated items by default)
  writeFileSync(
    path.join(temp, "library/catalog/manifest.json"),
    JSON.stringify(overrides.manifest ?? { version: "0.1.0", items: [] }, null, 2)
  );

  return temp;
}

test("curated audit passes on the committed repo", () => {
  execaSync("yarn", ["curated:audit"], { cwd: repoRoot });
});

test("curated audit passes with valid inventory file", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/inventory/source-inventory.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        generatedAt: "2026-05-13",
        sources: [
          {
            sourceId: "demo-source",
            sourceUrl: "https://example.com",
            license: "unknown",
            licenseConfidence: "unknown",
            auditedAt: "2026-05-13",
            items: [
              {
                id: "demo-source.foo-skill",
                name: "Foo Skill",
                kind: "skill",
                pathOrUrl: "skills/foo/SKILL.md",
                detectedStacks: [],
                summary: "A demo skill for testing",
                reviewStatus: "candidate"
              }
            ]
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, false);
});

test("curated audit fails when inventory references unknown sourceId", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/inventory/source-inventory.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        generatedAt: "2026-05-13",
        sources: [
          {
            sourceId: "nonexistent-source",
            sourceUrl: "https://example.com",
            license: "MIT",
            licenseConfidence: "high",
            auditedAt: "2026-05-13",
            items: []
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, true);
});

test("curated audit fails when inventory has duplicate item ids", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/inventory/source-inventory.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        generatedAt: "2026-05-13",
        sources: [
          {
            sourceId: "demo-source",
            sourceUrl: "https://example.com",
            license: "unknown",
            licenseConfidence: "unknown",
            auditedAt: "2026-05-13",
            items: [
              {
                id: "demo-source.foo",
                name: "Foo",
                kind: "skill",
                pathOrUrl: "skills/foo/SKILL.md",
                detectedStacks: [],
                summary: "A demo skill",
                reviewStatus: "candidate"
              },
              {
                id: "demo-source.foo",
                name: "Foo duplicate",
                kind: "skill",
                pathOrUrl: "skills/foo2/SKILL.md",
                detectedStacks: [],
                summary: "Duplicate id",
                reviewStatus: "candidate"
              }
            ]
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, true);
});

test("curated audit fails when decisions file has copy decision without pinnedRef", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/decisions/curation-decisions.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        items: [
          {
            id: "demo-source.foo-skill",
            sourceId: "demo-source",
            sourceUrl: "https://example.com/skills/foo",
            kind: "skill",
            license: "MIT",
            licenseConfidence: "high",
            decision: "copy",
            decisionReason: "Verbatim copy permitted by MIT license",
            riskLevel: "low",
            reviewStatus: "approved",
            auditedAt: "2026-05-13"
            // pinnedRef and hash intentionally missing
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, true);
});

test("curated audit fails when copy decision has unknown license without accepted-unknown justification", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/decisions/curation-decisions.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        items: [
          {
            id: "demo-source.foo-skill",
            sourceId: "demo-source",
            sourceUrl: "https://example.com/skills/foo",
            kind: "skill",
            license: "unknown",
            licenseConfidence: "unknown",
            pinnedRef: "abc1234",
            hash: "sha256-abc",
            decision: "copy",
            decisionReason: "Missing license justification",
            riskLevel: "low",
            reviewStatus: "approved",
            auditedAt: "2026-05-13"
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, true);
});

test("curated audit fails when copy decision is missing targetPath", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/decisions/curation-decisions.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        items: [
          {
            id: "demo-source.foo-skill",
            sourceId: "demo-source",
            sourceUrl: "https://example.com/skills/foo",
            kind: "skill",
            license: "MIT",
            licenseConfidence: "high",
            pinnedRef: "abc1234",
            hash: "sha256-abc",
            // targetPath intentionally missing
            decision: "copy",
            decisionReason: "Missing targetPath should fail",
            riskLevel: "low",
            reviewStatus: "candidate",
            auditedAt: "2026-05-13"
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, true);
});

test("curated audit passes when copy decision has accepted-unknown with justification", () => {
  const temp = scaffoldCuratedTemp();
  const targetPath = "library/curated/external/demo-source/foo/SKILL.md";
  mkdirSync(path.join(temp, "library/curated/external/demo-source/foo"), { recursive: true });
  writeFileSync(path.join(temp, targetPath), "# foo-skill\n\nCopied artifact content.\n");
  writeFileSync(
    path.join(temp, "library/curated/decisions/curation-decisions.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        items: [
          {
            id: "demo-source.foo-skill",
            sourceId: "demo-source",
            sourceUrl: "https://example.com/skills/foo",
            kind: "skill",
            license: "unknown",
            licenseConfidence: "accepted-unknown",
            licenseAcceptedUnknownJustification: "Site has no license file; content is publicly shared reference material with no commercial restriction stated. Low risk for internal tooling use.",
            pinnedRef: "abc1234",
            hash: "sha256-abc",
            targetPath,
            decision: "copy",
            decisionReason: "Accepted with unknown license per written justification",
            riskLevel: "low",
            reviewStatus: "approved",
            auditedAt: "2026-05-13"
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, false);
});

test("curated audit fails when manifest has curated item without reviewStatus:approved", () => {
  const temp = scaffoldCuratedTemp({
    manifest: {
      version: "0.1.0",
      items: [
        {
          id: "curated.foo-skill",
          source: "curated",
          reviewStatus: "candidate",
          type: "skill",
          path: "library/curated/external/demo-source/foo/SKILL.md"
        }
      ]
    }
  });
  runCuratedAudit(temp, true);
});

test("curated audit passes rejected decision without pinnedRef or targetPath", () => {
  const temp = scaffoldCuratedTemp();
  writeFileSync(
    path.join(temp, "library/curated/decisions/curation-decisions.json"),
    JSON.stringify(
      {
        version: "0.1.0",
        items: [
          {
            id: "demo-source.rejected-skill",
            sourceId: "demo-source",
            sourceUrl: "https://example.com/skills/rejected",
            kind: "skill",
            license: "unknown",
            licenseConfidence: "unknown",
            decision: "rejected",
            decisionReason: "Unsupported stack — PHP-only skill not relevant to Haus projects",
            riskLevel: "low",
            reviewStatus: "rejected",
            auditedAt: "2026-05-13"
          }
        ]
      },
      null,
      2
    )
  );
  runCuratedAudit(temp, false);
});