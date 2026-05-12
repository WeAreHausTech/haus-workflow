import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REVIEW_SKILL_IDS = new Set(["haus.security-review", "haus.production-readiness-review"]);

test("security and production readiness review skills use concrete folders and aligned metadata", () => {
  const manifest = JSON.parse(fs.readFileSync("library/catalog/manifest.json", "utf8"));
  const items = manifest.items.filter((item) => REVIEW_SKILL_IDS.has(item.id));
  assert.equal(items.length, REVIEW_SKILL_IDS.size, "missing review skill entries in manifest");

  const pathToId = new Map();
  for (const item of items) {
    assert.equal(item.type, "skill", `${item.id} must be skill type`);
    assert.equal(Boolean(item.whenToUse), true, `${item.id} missing whenToUse`);
    assert.equal(Boolean(item.whenNotToUse), true, `${item.id} missing whenNotToUse`);
    assert.equal(Array.isArray(item.references) && item.references.length > 0, true, `${item.id} missing references`);
    const existing = pathToId.get(item.path);
    assert.equal(existing === undefined, true, `${item.id} shares path with ${existing}`);
    pathToId.set(item.path, item.id);

    const skillPath = path.resolve(item.path, "SKILL.md");
    assert.equal(fs.existsSync(skillPath), true, `${item.id} missing SKILL.md`);
    const skillText = fs.readFileSync(skillPath, "utf8");
    assert.equal(skillText.includes("## Use when"), true, `${item.id} SKILL missing use boundary`);
    assert.equal(skillText.includes("## Do not use when"), true, `${item.id} SKILL missing not-use boundary`);
    for (const relRef of item.references) {
      const refPath = path.resolve(item.path, relRef);
      assert.equal(fs.existsSync(refPath), true, `${item.id} missing reference ${relRef}`);
    }
  }
});
