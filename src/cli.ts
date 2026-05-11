#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { runApply } from "./commands/apply.js";
import { runCatalogAudit } from "./commands/catalog-audit.js";
import { runContext } from "./commands/context.js";
import { runDoctor } from "./commands/doctor.js";
import { runExplainContext } from "./commands/explain-context.js";
import { runExplainRecommendation } from "./commands/explain-recommendation.js";
import { runGuard } from "./commands/guard.js";
import { runMemory } from "./commands/memory.js";
import { runPlugin } from "./commands/plugin.js";
import { runRecommend } from "./commands/recommend.js";
import { runRefresh } from "./commands/refresh.js";
import { runScan } from "./commands/scan.js";
import { runSetupProject } from "./commands/setup-project.js";
import { runSources } from "./commands/sources.js";
import { runUndo } from "./commands/undo.js";
import { runUpdate } from "./commands/update.js";
import { runWorkspace } from "./commands/workspace.js";
import { packageRoot } from "./utils/paths.js";

function cliVersion(): string {
  try {
    const pkgPath = path.join(packageRoot(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program.name("haus").description("Haus AI workflow CLI").version(cliVersion());
program.command("scan").option("--json").action(runScan);
program.command("recommend").option("--json").action(runRecommend);
program.command("setup-project").option("--guided").option("--fast").option("--json").action(runSetupProject);
program.command("doctor").option("--hooks", "Verify .claude/settings.json matches plugin hooks only").action(runDoctor);
program.command("apply").option("--dry-run").option("--write").action(runApply);
program.command("undo").option("-y, --yes", "Skip confirmation").action(runUndo);
program
  .command("explain-context")
  .option("--task <task>")
  .option("--json")
  .option("--stats")
  .action(runExplainContext);
program.command("explain-recommendation").option("--json").action(runExplainRecommendation);
program.command("context").option("--task <task>").option("--from-hook").option("--json").action(runContext);
program.command("refresh").action(runRefresh);
program.command("catalog-audit").action(runCatalogAudit);
program.command("update").option("--check").action(runUpdate);

const memory = program.command("memory");
memory.command("status").action(() => runMemory("status", {}));
memory.command("add <text>").action((text) => runMemory("add", { text }));
memory.command("inject").option("--task <task>").option("--from-hook").action((opts) => runMemory("inject", opts));
memory.command("promote").action(() => runMemory("promote", {}));

const sources = program.command("sources");
sources.command("sync").option("--check").action((opts) => runSources("sync", opts));
sources.command("report").action((opts) => runSources("report", opts));
sources.command("audit").action((opts) => runSources("audit", opts));

const plugin = program.command("plugin");
plugin.command("install").action((opts) => runPlugin("install", opts));
plugin.command("validate").action((opts) => runPlugin("validate", opts));

const guard = program.command("guard");
guard.command("file-access").option("--from-hook").action((opts) => runGuard("file-access", opts));
guard.command("bash").option("--from-hook").action((opts) => runGuard("bash", opts));

const workspace = program.command("workspace");
workspace.command("init").action(() => runWorkspace("init"));
workspace.command("scan").action(() => runWorkspace("scan"));

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
