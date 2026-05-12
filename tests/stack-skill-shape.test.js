import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const STACK_SKILL_IDS = new Set([
  "haus.vendure-plugin-patterns",
  "haus.vendure-app-patterns",
  "haus.nestjs-graphql-patterns",
  "haus.laravel-patterns",
  "haus.laravel-nova-patterns",
  "haus.wordpress-patterns",
  "haus.wordpress-bedrock-patterns",
  "haus.wordpress-acf-elementor-jetengine-patterns",
  "haus.dotnet-patterns",
  "haus.dotnet-service-patterns",
  "haus.auth-oidc-azure-bankid-patterns",
  "haus.database-patterns",
  "haus.nextjs-patterns",
  "haus.react19-patterns",
  "haus.typescript6-patterns",
  "haus.vite8-patterns",
  "haus.tanstack-query-router-patterns",
  "haus.radix-shadcn-patterns",
  "haus.tailwind-scss-patterns",
  "haus.vue-patterns",
  "haus.nx21-monorepo-patterns",
  "haus.turbo-monorepo-patterns",
  "haus.package-manager-yarn4-pnpm89",
  "haus.playwright-patterns",
  "haus.testing-library-patterns",
  "haus.phpunit-patterns",
  "haus.storybook-patterns"
]);

test("stack skills use unique concrete folders with aligned metadata", () => {
  const manifest = JSON.parse(fs.readFileSync("library/catalog/manifest.json", "utf8"));
  const items = manifest.items.filter((item) => STACK_SKILL_IDS.has(item.id));
  assert.equal(items.length, STACK_SKILL_IDS.size, "missing stack skill entries in manifest");

  const pathToId = new Map();
  for (const item of items) {
    assert.equal(item.type, "skill", `${item.id} must be skill type`);
    assert.equal(Boolean(item.whenToUse), true, `${item.id} missing whenToUse`);
    assert.equal(Boolean(item.whenNotToUse), true, `${item.id} missing whenNotToUse`);
    assert.equal(Array.isArray(item.references) && item.references.length > 0, true, `${item.id} missing references metadata`);
    const existing = pathToId.get(item.path);
    assert.equal(existing === undefined, true, `${item.id} shares path with ${existing}`);
    pathToId.set(item.path, item.id);

    const skillPath = path.resolve(item.path, "SKILL.md");
    assert.equal(fs.existsSync(skillPath), true, `${item.id} missing SKILL.md`);
    const skillText = fs.readFileSync(skillPath, "utf8");
    assert.equal(skillText.includes("## Use when"), true, `${item.id} missing use boundary`);
    assert.equal(skillText.includes("## Do not use when"), true, `${item.id} missing not-use boundary`);
    for (const relRef of item.references) {
      const refPath = path.resolve(item.path, relRef);
      assert.equal(fs.existsSync(refPath), true, `${item.id} missing reference file ${relRef}`);
    }
  }
});
