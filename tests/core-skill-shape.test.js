// HAUS-PRERELEASE-CLEANUP: P4e — tests plugin skill shape; removed with plugin/.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const coreSkills = [
  "plugin/skills/haus-context-router/SKILL.md",
  "plugin/skills/haus-workflow/SKILL.md",
  "plugin/skills/haus-setup-project/SKILL.md",
  "plugin/skills/haus-skill-author/SKILL.md",
  "plugin/skills/haus-global-engineering-rules/SKILL.md"
];

test("core skills are router-shaped and bounded", () => {
  for (const file of coreSkills) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(text.startsWith("---\n"), true, `${file} missing frontmatter`);
    assert.equal(text.includes("name:"), true, `${file} missing name`);
    assert.equal(text.includes("description:"), true, `${file} missing description`);
    assert.equal(text.includes("## Use when"), true, `${file} missing use-when section`);
    assert.equal(text.includes("## Do not use when"), true, `${file} missing do-not-use section`);
    const lines = text.trimEnd().split("\n").length;
    assert.equal(lines <= 80, true, `${file} exceeds router size budget`);
  }
});

test("core skill references exist", () => {
  const expectedReferences = [
    "plugin/skills/haus-context-router/references/context-minimization.md",
    "plugin/skills/haus-context-router/references/task-intents.md",
    "plugin/skills/haus-workflow/references/verification-loop.md",
    "plugin/skills/haus-workflow/references/safe-change-checklist.md",
    "plugin/skills/haus-setup-project/references/setup-modes.md",
    "plugin/skills/haus-skill-author/references/skill-authoring-rules.md",
    "plugin/skills/haus-skill-author/references/router-vs-manual.md",
    "plugin/skills/haus-global-engineering-rules/references/security-posture.md",
    "plugin/skills/haus-global-engineering-rules/references/tests-and-validation.md",
    "plugin/skills/haus-global-engineering-rules/references/change-discipline.md"
  ];
  for (const ref of expectedReferences) {
    assert.equal(fs.existsSync(path.resolve(ref)), true, `missing reference: ${ref}`);
  }
});