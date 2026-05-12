import test from "node:test";
import assert from "node:assert/strict";
import { cloneFixtureToTemp, runHaus } from "./helpers/fixture-runner.js";

const FRONTEND_ONLY_RULES = new Set([
  "haus.nextjs-patterns",
  "haus.react19-patterns",
  "haus.tailwind-scss-patterns",
  "haus.tanstack-query-router-patterns",
  "haus.radix-shadcn-patterns",
  "haus.storybook-patterns",
  "haus.vue-patterns"
]);

const BACKEND_ONLY_RULES = new Set([
  "haus.laravel-patterns",
  "haus.phpunit-patterns",
  "haus.laravel-nova-patterns",
  "haus.dotnet-patterns",
  "haus.dotnet-service-patterns",
  "haus.nestjs-graphql-patterns"
]);

const TESTING_RULES = new Set([
  "haus.playwright-patterns",
  "haus.storybook-patterns",
  "haus.testing-library-patterns",
  "haus.phpunit-patterns"
]);

const MONOREPO_RULES = new Set([
  "haus.nx21-monorepo-patterns",
  "haus.turbo-monorepo-patterns"
]);

const cases = [
  {
    name: "laravel-with-react-frontend / add queue job rejects frontend rules",
    fixture: "laravel-with-react-frontend",
    task: "add queue job",
    forbid: FRONTEND_ONLY_RULES,
    forbidLabel: "frontend-only"
  },
  {
    name: "laravel-with-react-frontend / build dashboard route rejects backend rules",
    fixture: "laravel-with-react-frontend",
    task: "build dashboard route",
    forbid: BACKEND_ONLY_RULES,
    forbidLabel: "backend-only"
  },
  {
    name: "vendure-with-nextjs-storefront / build shipping plugin rejects storefront rules",
    fixture: "vendure-with-nextjs-storefront",
    task: "build shipping plugin",
    forbid: FRONTEND_ONLY_RULES,
    forbidLabel: "frontend-only"
  },
  {
    name: "vendure-with-nextjs-storefront / build dashboard route rejects vendure backend",
    fixture: "vendure-with-nextjs-storefront",
    task: "build dashboard route",
    forbid: new Set([
      "haus.vendure-plugin-patterns",
      "haus.vendure-app-patterns",
      "haus.nestjs-graphql-patterns"
    ]),
    forbidLabel: "vendure backend"
  },
  {
    name: "nextjs-app / build dashboard route rejects testing rules",
    fixture: "nextjs-app",
    task: "build dashboard route",
    forbid: TESTING_RULES,
    forbidLabel: "testing"
  },
  {
    name: "laravel-app / add queue job rejects testing rules",
    fixture: "laravel-app",
    task: "add queue job",
    forbid: TESTING_RULES,
    forbidLabel: "testing"
  },
  {
    name: "nx-workspace / create new lib rejects implementation rules",
    fixture: "nx-workspace",
    task: "create new lib",
    forbid: new Set([
      "haus.react19-patterns",
      "haus.typescript6-patterns",
      "haus.nextjs-patterns"
    ]),
    forbidLabel: "implementation"
  },
  {
    name: "turbo-monorepo / add shared package rejects implementation rules",
    fixture: "turbo-monorepo",
    task: "add shared package",
    forbid: new Set([
      "haus.react19-patterns",
      "haus.typescript6-patterns",
      "haus.nextjs-patterns"
    ]),
    forbidLabel: "implementation"
  },
  {
    name: "vendure-monorepo / add admin ui extension rejects frontend-only rules",
    fixture: "vendure-monorepo",
    task: "add admin ui extension",
    forbid: FRONTEND_ONLY_RULES,
    forbidLabel: "frontend-only"
  },
  {
    name: "vendure-with-nextjs-storefront / add tanstack query mutation stays frontend",
    fixture: "vendure-with-nextjs-storefront",
    task: "add tanstack query mutation",
    forbid: new Set([
      "haus.vendure-plugin-patterns",
      "haus.vendure-app-patterns",
      "haus.nestjs-graphql-patterns",
      "haus.laravel-patterns"
    ]),
    forbidLabel: "backend"
  },
  {
    name: "wordpress-with-node-tooling / add custom block rejects monorepo rules",
    fixture: "wordpress-with-node-tooling",
    task: "add custom block",
    forbid: MONOREPO_RULES,
    forbidLabel: "monorepo"
  }
];

for (const c of cases) {
  test(`no-bleed: ${c.name}`, () => {
    const cwd = cloneFixtureToTemp(c.fixture);
    runHaus(cwd, "scan --json");
    runHaus(cwd, "recommend --json");
    const output = runHaus(cwd, `context --task "${c.task}" --json`);
    const parsed = JSON.parse(output);
    const selectedIds = parsed.selectedRules.map((r) => r.id);
    const leaks = selectedIds.filter((id) => c.forbid.has(id));
    assert.equal(
      leaks.length,
      0,
      `${c.forbidLabel} rules leaked into task '${c.task}': ${leaks.join(", ")} (selected: ${selectedIds.join(", ")})`
    );
    assert.equal(
      parsed.selectedRules.some((rule) => rule.selectionMode === "baseline"),
      false,
      `baselines must not appear in task '${c.task}'`
    );
  });
}
