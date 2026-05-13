#!/usr/bin/env node
// Batch-run QA across all synthetic fixtures + realistic tasks.
// Emits a structured table per fixture/task and writes raw outputs under tmp/qa-out/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execaSync } from "execa";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cli = path.join(root, "dist/cli.js");
const out = path.join(root, "tmp/qa-out");
fs.mkdirSync(out, { recursive: true });

const targets = [
  {
    fixture: "vendure-monorepo",
    tasks: ["build shipping plugin", "add admin ui extension", "create graphql resolver"],
  },
  { fixture: "nextjs-app", tasks: ["build dashboard route", "add tanstack query mutation"] },
  { fixture: "nest-graphql-api", tasks: ["add graphql resolver with auth guard"] },
  { fixture: "laravel-app", tasks: ["create nova resource", "add queue job"] },
  { fixture: "wordpress-bedrock-site", tasks: ["add custom block"] },
  { fixture: "turbo-monorepo", tasks: ["add shared package"] },
  { fixture: "nx-workspace", tasks: ["create new lib"] },
  { fixture: "laravel-with-react-frontend", tasks: ["add queue job", "build dashboard route"] },
  { fixture: "vendure-with-nextjs-storefront", tasks: ["build shipping plugin", "build dashboard route"] },
  { fixture: "orphan-graphql-config", tasks: ["generate graphql types"] },
  { fixture: "wordpress-with-node-tooling", tasks: ["add custom block"] },
];

const results = [];
for (const t of targets) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `haus-qa-${t.fixture}-`));
  fs.cpSync(path.join(root, "tests/fixtures/repos", t.fixture), tmp, { recursive: true });
  execaSync("node", [cli, "scan", "--json"], { cwd: tmp, stdout: "ignore" });
  execaSync("node", [cli, "recommend", "--json"], { cwd: tmp, stdout: "ignore" });
  const scan = JSON.parse(fs.readFileSync(path.join(tmp, ".haus-ai/context-map.json"), "utf8"));
  const rec = JSON.parse(fs.readFileSync(path.join(tmp, ".haus-ai/recommendation.json"), "utf8"));
  const taskCtx = {};
  for (const task of t.tasks) {
    const raw = execaSync("node", [cli, "context", "--task", task, "--json"], { cwd: tmp }).stdout;
    taskCtx[task] = JSON.parse(raw);
  }
  const entry = {
    fixture: t.fixture,
    roles: scan.repoRoles,
    stacks: scan.detectedStacks,
    selected: rec.recommended.map((x) => ({
      id: x.id,
      c: x.confidenceLevel,
      reasons: x.reasons.map((y) => y.code),
      score: x.score,
    })),
    skipped: rec.skipped.map((x) => x.id),
    tasks: Object.fromEntries(Object.entries(taskCtx).map(([k, v]) => [k, v.selectedRules.map((x) => x.id)])),
  };
  fs.writeFileSync(path.join(out, `${t.fixture}.json`), JSON.stringify(entry, null, 2));
  results.push(entry);
  fs.rmSync(tmp, { recursive: true, force: true });
}

fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(results, null, 2));
console.log(`Wrote ${results.length} fixture results to ${out}`);
