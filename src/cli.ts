#!/usr/bin/env node
import { Command } from "commander";
import { runApply } from "./commands/apply.js";
import { runCatalogAudit } from "./commands/catalog-audit.js";
import { runContext } from "./commands/context.js";
import { runDoctor } from "./commands/doctor.js";
import { runExplainContext } from "./commands/explain-context.js";
import { runGuard } from "./commands/guard.js";
import { runMemory } from "./commands/memory.js";
import { runPlugin } from "./commands/plugin.js";
import { runRecommend } from "./commands/recommend.js";
import { runRefresh } from "./commands/refresh.js";
import { runScan } from "./commands/scan.js";
import { runSetupProject } from "./commands/setup-project.js";
import { runSources } from "./commands/sources.js";
import { runUpdate } from "./commands/update.js";
import { runWorkspace } from "./commands/workspace.js";

const program = new Command();

program.name("haus").description("Haus AI workflow CLI").version("0.2.0");

program.command("scan").option("--json", "JSON output").action(runScan);
program.command("recommend").option("--json", "JSON output").action(runRecommend);
program
  .command("setup-project")
  .option("--guided", "Guided setup")
  .option("--fast", "Fast setup")
  .option("--json", "JSON output")
  .action(runSetupProject);
program.command("doctor").action(runDoctor);
program.command("apply").option("--dry-run").option("--write").action(runApply);
program.command("explain-context").action(runExplainContext);
program.command("context").option("--task <task>").option("--from-hook").action(runContext);
program.command("refresh").action(runRefresh);
program.command("catalog-audit").action(runCatalogAudit);

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

program.command("update").option("--check").action(runUpdate);

const workspace = program.command("workspace");
workspace.command("init").action(() => runWorkspace("init"));
workspace.command("scan").action(() => runWorkspace("scan"));

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

/*
function scanCommand(root: string, json: boolean): ContextMap {
  const context = buildContextMap(root);
  writeContextFiles(root, context);
  if (json) {
    console.log(JSON.stringify(context, null, 2));
  } else {
    console.log(`Haus AI scan complete.\n\nRepo roles: ${context.repoRoles.join(", ") || "unknown"}\nPackage manager: ${context.packageManager}\nSelected context: ${context.selectedCatalogItems.length} item(s)\nEstimated context: ${context.tokenEstimate} tokens\nWarnings: ${context.warnings.length}`);
  }
  return context;
}

function doctorCommand(root: string): void {
  const context = readContextOrScan(root);
  console.log("Haus AI Doctor\n");
  console.log(`Status: ${context.warnings.length ? "WARN" : "OK"}`);
  console.log(`Repo: ${context.repoName}`);
  console.log(`Roles: ${context.repoRoles.join(", ") || "unknown"}`);
  console.log(`Confidence: ${context.confidence}`);
  console.log(`Package manager: ${context.packageManager}`);
  console.log("\nDetected stacks:");
  for (const [group, values] of Object.entries(context.detectedStacks)) {
    if (values.length) console.log(`- ${group}: ${values.join(", ")}`);
  }
  console.log("\nSelected context:");
  for (const item of context.selectedCatalogItems) console.log(`- ${item.id}: ${item.reason}`);
  console.log(`\nEstimated context: ${context.tokenEstimate} tokens`);
  if (context.warnings.length) {
    console.log("\nWarnings:");
    for (const warning of context.warnings) console.log(`- ${warning}`);
  }
}

function applyCommand(root: string, dryRun: boolean, write: boolean): void {
  if (!dryRun && !write) {
    console.log("Use haus-ai apply --dry-run first, then haus-ai apply --write.");
    return;
  }

  const context = readContextOrScan(root);
  const planned = plannedWrites(root, context);

  console.log(dryRun ? "Haus AI apply dry run\n" : "Applying Haus AI Claude Code files\n");
  for (const file of planned) console.log(`- ${path.relative(root, file)}`);

  if (dryRun) return;

  for (const file of planned) ensureDir(path.dirname(file));
  writeClaudeFiles(root, context);
  copySelectedResources(root, context);
  console.log("\nDone. Start Claude Code with: claude");
}

function explainContextCommand(root: string): void {
  const context = readContextOrScan(root);
  console.log("Selected context\n");
  for (const item of context.selectedCatalogItems) {
    console.log(`- ${item.id}`);
    console.log(`  Reason: ${item.reason}`);
    console.log(`  Tags: ${item.tags.join(", ")}`);
  }
  console.log("\nSkipped context\n");
  for (const item of context.excludedCatalogItems) console.log(`- ${item.id}: ${item.reason}`);
}

function contextCommand(root: string, task: string, fromHook: boolean): void {
  const context = readContextOrScan(root);
  const summary = readTextSafe(path.join(root, ".haus-ai", "repo-summary.md")) ?? "";

  const packet = `# Haus AI Context Packet\n\nTask: ${task || "not provided"}\n\nRepo roles: ${context.repoRoles.join(", ") || "unknown"}\nPackage manager: ${context.packageManager}\nEstimated selected context: ${context.tokenEstimate} tokens\n\nSelected Haus context:\n${context.selectedCatalogItems.map((item) => `- ${item.id}: ${item.reason}`).join("\n")}\n\nSecurity rules:\n- Do not read .env, .env.*, private keys, dumps, logs, uploads, customer exports, or credentials.\n- Use .env.example or documented config only.\n- Make the smallest safe change and run relevant validation.\n\n${summary}`;

  if (fromHook) {
    console.log(packet.slice(0, 12000));
  } else {
    console.log(packet);
  }
}

function refreshCommand(root: string): void {
  const hashPath = path.join(root, ".haus-ai", "scan-hashes.json");
  if (!existsSync(hashPath)) {
    console.log("No previous scan found. Running scan now.");
    scanCommand(root, false);
    return;
  }
  const oldHashes = readJsonSafe(hashPath) as Record<string, string> | undefined;
  const newHashes = collectImportantFileHashes(root);
  if (JSON.stringify(oldHashes) === JSON.stringify(newHashes)) {
    console.log("No refresh needed. Important project files are unchanged.");
    return;
  }
  console.log("Important project files changed. Refreshing Haus AI context.");
  scanCommand(root, false);
}

function catalogAuditCommand(): void {
  const manifest = loadCatalog();
  const forbidden = [
    "python",
    "django",
    "go",
    "golang",
    "rust",
    "swift",
    "kotlin",
    "java",
    "spring",
    "jpa",
    "android",
    "flutter",
    "dart",
    "cpp",
    "c++",
    "perl",
    "clickhouse",
    "defi",
    "trading"
  ];

  const failures: string[] = [];
  for (const item of manifest) {
    const haystack = [item.id, item.path, item.title, ...item.tags].join(" ").toLowerCase();
    for (const word of forbidden) {
      if (haystack.includes(word)) failures.push(`${item.id} contains unsupported term: ${word}`);
    }
  }

  if (failures.length) fail(`Catalog audit failed:\n${failures.map((f) => `- ${f}`).join("\n")}`);
  console.log("Catalog audit passed. No unsupported stacks found.");
}

function guardCommand(kind: string): void {
  const input = readStdinIfAny();
  let parsed: JsonObject = {};
  try {
    parsed = input ? (JSON.parse(input) as JsonObject) : {};
  } catch {
    parsed = {};
  }

  if (kind === "file-access") {
    const toolInput = (parsed.tool_input ?? {}) as JsonObject;
    const candidate = String(toolInput.file_path ?? toolInput.path ?? "");
    if (candidate && isSensitivePath(candidate)) {
      denyHook(`Blocked by Haus AI: ${candidate} is sensitive. Use safe examples or documented config instead.`);
    }
    return;
  }

  if (kind === "bash") {
    const toolInput = (parsed.tool_input ?? {}) as JsonObject;
    const command = String(toolInput.command ?? "");
    const dangerous = [/rm\s+-rf/, /git\s+reset\s+--hard/, /git\s+push\s+--force/, /npm\s+publish/, /pnpm\s+publish/, /yarn\s+npm\s+publish/, /drop\s+database/i, /truncate\s+table/i, /migrate\s+--force/];
    if (dangerous.some((pattern) => pattern.test(command))) {
      denyHook(`Blocked by Haus AI: dangerous command requires human review: ${command}`);
    }
    return;
  }
}

function workspaceCommand(root: string, action: string): void {
  if (action === "init") {
    initCommand(root);
    return;
  }
  if (action === "scan") {
    const workspacePath = path.join(root, "haus.workspace.yaml");
    if (!existsSync(workspacePath)) {
      console.log("No haus.workspace.yaml found. Run haus-ai workspace init first.");
      return;
    }
    console.log("Workspace scan MVP: scan each repo with haus-ai scan, then add repo summaries manually to .haus-ai/cross-repo-summary.md.");
    return;
  }
  console.log("Usage: haus-ai workspace init | scan");
}

function buildContextMap(root: string): ContextMap {
  const detected = detectProject(root);
  const catalog = loadCatalog();
  const selected: SelectedItem[] = [];
  const excluded: ExcludedItem[] = [];

  for (const item of catalog) {
    const decision = shouldSelectItem(item, detected);
    if (decision.selected) selected.push({ ...item, reason: decision.reason });
    else excluded.push({ id: item.id, reason: decision.reason });
  }

  const tokenEstimate = selected.reduce((sum, item) => sum + item.tokenEstimate, 0);

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    root,
    repoName: detected.repoName,
    packageManager: detected.packageManager,
    repoRoles: detected.repoRoles,
    confidence: detected.confidence,
    detectedStacks: detected.detectedStacks,
    dependencies: detected.dependencies,
    packageName: detected.packageName,
    signals: detected.signals,
    selectedCatalogItems: selected,
    excludedCatalogItems: excluded,
    tokenEstimate,
    warnings: detected.warnings
  };
}

function detectProject(root: string): Omit<ContextMap, "version" | "generatedAt" | "root" | "selectedCatalogItems" | "excludedCatalogItems" | "tokenEstimate"> {
  const pkg = readJsonSafe(path.join(root, "package.json"));
  const composer = readJsonSafe(path.join(root, "composer.json"));
  const packageName = typeof pkg?.name === "string" ? pkg.name : undefined;
  const repoName = packageName ?? path.basename(root);
  const deps = collectDependencies(pkg, composer);
  const depSet = new Set(deps.map((dep) => dep.toLowerCase()));
  const roles = new Set<string>();
  const signals: string[] = [];
  const warnings: string[] = [];
  const detectedStacks: Record<string, string[]> = {
    languages: [],
    backend: [],
    frontend: [],
    databases: [],
    packageManagers: [],
    testing: [],
    auth: [],
    monorepo: [],
    tooling: []
  };

  const addStack = (group: string, value: string, signal: string) => {
    const list = detectedStacks[group] ?? [];
    if (!list.includes(value)) list.push(value);
    detectedStacks[group] = list;
    signals.push(signal);
  };
  const addRole = (value: string, signal: string) => {
    roles.add(value);
    signals.push(signal);
  };
  const hasDep = (name: string) => depSet.has(name.toLowerCase());
  const hasDepPrefix = (prefix: string) => deps.some((dep) => dep.toLowerCase().startsWith(prefix.toLowerCase()));
  const hasFile = (rel: string) => existsSync(path.join(root, rel));
  const hasAnyRootFileEnding = (ending: string) => listFiles(root, { maxFiles: 200, maxDepth: 2 }).some((file) => file.endsWith(ending));

  const packageManager = detectPackageManager(root, pkg);
  if (packageManager !== "unknown") addStack("packageManagers", packageManager, `Detected ${packageManager}`);

  if (hasFile("tsconfig.json") || hasDep("typescript") || hasSourceExtension(root, [".ts", ".tsx"])) addStack("languages", "typescript", "Detected TypeScript");
  if (hasSourceExtension(root, [".js", ".jsx", ".mjs", ".cjs"])) addStack("languages", "javascript", "Detected JavaScript");
  if (composer || hasSourceExtension(root, [".php"])) addStack("languages", "php", "Detected PHP");
  if (hasAnyRootFileEnding(".csproj") || hasAnyRootFileEnding(".sln") || hasSourceExtension(root, [".cs"])) addStack("languages", "csharp", "Detected C#/.NET");

  if (hasDep("next") || hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts")) {
    addStack("frontend", "nextjs", "Detected Next.js");
    addRole("next-app", "Next.js project markers found");
  }
  if (hasDep("react")) {
    addStack("frontend", "react", "Detected React");
    addRole("react-app", "React dependency found");
  }
  if (hasDep("vite") || hasFile("vite.config.js") || hasFile("vite.config.mjs") || hasFile("vite.config.ts")) {
    addStack("frontend", "vite", "Detected Vite");
    addRole("vite-app", "Vite project markers found");
  }
  if (hasDep("vue")) {
    addStack("frontend", "vue", "Detected Vue");
    addRole("vue-app", "Vue dependency found");
  }
  if (hasDep("tailwindcss") || hasFile("tailwind.config.js") || hasFile("tailwind.config.ts")) addStack("frontend", "tailwind", "Detected Tailwind CSS");
  if (hasDepPrefix("@radix-ui/")) addStack("frontend", "radix", "Detected Radix UI");
  if (hasFile("components.json") || hasDep("class-variance-authority") || hasDep("tailwind-merge")) addStack("frontend", "shadcn", "Detected shadcn/ui markers");
  if (hasDep("@tanstack/react-query")) addStack("frontend", "tanstack-query", "Detected TanStack Query");
  if (hasDep("@tanstack/react-router")) addStack("frontend", "tanstack-router", "Detected TanStack Router");

  if (hasFile("nx.json") || hasDep("nx")) {
    addStack("monorepo", "nx", "Detected Nx");
    addRole("nx-monorepo", "Nx monorepo markers found");
  }
  if (hasFile("turbo.json") || hasDep("turbo")) {
    addStack("monorepo", "turbo", "Detected Turborepo");
    addRole("turbo-monorepo", "Turbo markers found");
  }

  const hasVendurePlugin = containsInSafeFiles(root, "@VendurePlugin", [".ts"], 300);
  const packageIsHausVendure = Boolean(packageName?.startsWith("@haus/vendure-"));
  if (hasDep("@vendure/core") || hasVendurePlugin || packageIsHausVendure) {
    addStack("backend", "vendure", "Detected Vendure");
    addStack("backend", "nestjs", "Vendure plugins are NestJS modules");
    addRole(hasVendurePlugin || packageIsHausVendure ? "vendure-plugin" : "vendure-app", "Vendure markers found");
  }
  if (hasDep("@nestjs/core")) {
    addStack("backend", "nestjs", "Detected NestJS");
    addRole("nestjs-api", "NestJS dependency found");
  }
  if (hasDep("graphql") || hasDep("@nestjs/graphql") || hasSourceExtension(root, [".graphql"])) {
    addStack("backend", "graphql", "Detected GraphQL");
    addRole("graphql-api", "GraphQL markers found");
  }
  if (hasDep("express")) {
    addStack("backend", "express", "Detected Express.js");
    addRole("express-service", "Express dependency found");
  }

  const composerRequires = composer ? { ...(composer.require as JsonObject | undefined), ...(composer["require-dev"] as JsonObject | undefined) } : {};
  if (hasFile("artisan") || "laravel/framework" in composerRequires) {
    addStack("backend", "laravel", "Detected Laravel");
    addRole("laravel-app", "Laravel markers found");
  }
  if ("laravel/nova" in composerRequires) {
    addStack("backend", "laravel-nova", "Detected Laravel Nova");
    addRole("laravel-nova-app", "Laravel Nova dependency found");
  }
  if (hasFile("wp-config.php") || hasFile("wp-content") || "roots/bedrock" in composerRequires || hasFile("web/app")) {
    addStack("backend", "wordpress", "Detected WordPress");
    addRole("wordpress-site", "WordPress markers found");
    if ("roots/bedrock" in composerRequires || hasFile("web/app")) addRole("wordpress-bedrock-site", "Bedrock markers found");
  }
  if (hasAnyRootFileEnding(".csproj") || hasAnyRootFileEnding(".sln")) {
    addStack("backend", "dotnet", "Detected .NET");
    addRole("dotnet-service", ".NET project files found");
  }

  if (hasDep("pg") || hasDep("postgres") || containsInSafeFiles(root, "postgres", [".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("databases", "postgresql", "Detected PostgreSQL markers");
  if (hasDep("mysql2") || hasDep("mariadb") || containsInSafeFiles(root, "mariadb", [".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("databases", "mariadb", "Detected MariaDB/MySQL markers");
  if (hasDep("mssql") || containsInSafeFiles(root, "sqlsrv", [".php", ".json", ".ts", ".cs"], 200) || containsInSafeFiles(root, "Microsoft.Data.SqlClient", [".csproj", ".cs"], 200)) addStack("databases", "mssql", "Detected MSSQL markers");
  if (hasDep("@elastic/elasticsearch") || containsInSafeFiles(root, "elasticsearch", [".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("databases", "elasticsearch", "Detected Elasticsearch markers");

  if (hasDep("@playwright/test") || hasFile("playwright.config.ts") || hasFile("playwright.config.js")) addStack("testing", "playwright", "Detected Playwright");
  if (hasDepPrefix("@testing-library/")) addStack("testing", "testing-library", "Detected Testing Library");
  if (hasFile("phpunit.xml") || "phpunit/phpunit" in composerRequires) addStack("testing", "phpunit", "Detected PHPUnit");
  if (hasFile(".storybook") || hasDepPrefix("@storybook/") || hasDep("storybook")) addStack("testing", "storybook", "Detected Storybook");
  if (hasDep("wisest")) addStack("testing", "wisest", "Detected Wisest");

  if (hasDep("openid-client") || containsInSafeFiles(root, "OIDC", [".example", ".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("auth", "oidc", "Detected OpenID Connect markers");
  if (hasDepPrefix("@azure/msal") || hasDep("passport-azure-ad") || containsInSafeFiles(root, "AZURE_AD", [".example", ".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("auth", "azure-ad", "Detected Azure AD markers");
  if (containsInSafeFiles(root, "BANKID", [".example", ".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("auth", "bankid", "Detected BankID markers");
  if (containsInSafeFiles(root, "MYID", [".example", ".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("auth", "myid", "Detected MyID markers");
  if (containsInSafeFiles(root, "CGI", [".example", ".ts", ".js", ".php", ".json", ".yml", ".yaml"], 200)) addStack("auth", "cgi", "Detected CGI auth markers");

  if (roles.size === 0) warnings.push("Could not confidently classify this repo. haus-ai apply should not be used until detection is clear.");
  if (packageManager === "unknown") warnings.push("Could not detect package manager. Expected pnpm, yarn, or npm markers.");

  const confidence = roles.size === 0 ? 0.2 : Number(Math.min(0.99, 0.55 + signals.length * 0.025).toFixed(2));

  return {
    repoName,
    packageManager,
    repoRoles: Array.from(roles).sort(),
    confidence,
    detectedStacks: sortStacks(detectedStacks),
    dependencies: deps.sort(),
    packageName,
    signals: Array.from(new Set(signals)).sort(),
    warnings
  };
}

function shouldSelectItem(item: CatalogItem, context: Omit<ContextMap, "version" | "generatedAt" | "root" | "selectedCatalogItems" | "excludedCatalogItems" | "tokenEstimate">): { selected: boolean; reason: string } {
  if (item.default) return { selected: true, reason: "Default Haus context" };

  const roleMatch = item.repoRoles.some((role) => context.repoRoles.includes(role));
  const stackSet = new Set(Object.values(context.detectedStacks).flat());
  const tagMatch = item.tags.some((tag) => stackSet.has(tag));
  const anyReqs = item.requiresAny ?? [];
  const allReqs = item.requiresAll ?? [];
  const anyPass = anyReqs.length === 0 || anyReqs.some((req) => requirementMatches(req, context));
  const allPass = allReqs.every((req) => requirementMatches(req, context));

  if ((roleMatch || tagMatch) && anyPass && allPass) {
    const matched = roleMatch ? "repo role" : "detected stack";
    return { selected: true, reason: `Matched ${matched}` };
  }

  if (!roleMatch && !tagMatch) return { selected: false, reason: "No matching repo role or detected stack" };
  if (!anyPass) return { selected: false, reason: "Required signal was not found" };
  if (!allPass) return { selected: false, reason: "One or more required signals were missing" };
  return { selected: false, reason: "Not selected" };
}

function requirementMatches(req: Requirement, context: Omit<ContextMap, "version" | "generatedAt" | "root" | "selectedCatalogItems" | "excludedCatalogItems" | "tokenEstimate">): boolean {
  if (req.dependency) return context.dependencies.includes(req.dependency);
  if (req.dependencyPrefix) return context.dependencies.some((dep) => dep.startsWith(req.dependencyPrefix ?? ""));
  if (req.repoRole) return context.repoRoles.includes(req.repoRole);
  if (req.stack) return Object.values(context.detectedStacks).flat().includes(req.stack);
  if (req.file) return existsSync(path.join(process.cwd(), req.file));
  if (req.packageNamePattern && context.packageName) return wildcardMatch(context.packageName, req.packageNamePattern);
  return false;
}

function writeContextFiles(root: string, context: ContextMap): void {
  const dir = path.join(root, ".haus-ai");
  ensureDir(dir);
  writeJson(path.join(dir, "context-map.json"), context);
  writeJson(path.join(dir, "selected-context.json"), {
    selected: context.selectedCatalogItems.map((item) => ({ id: item.id, type: item.type, path: item.path, reason: item.reason, tokenEstimate: item.tokenEstimate })),
    tokenEstimate: context.tokenEstimate
  });
  writeJson(path.join(dir, "scan-hashes.json"), collectImportantFileHashes(root));
  writeFileSync(path.join(dir, "repo-summary.md"), repoSummary(context), "utf8");
}

function writeClaudeFiles(root: string, context: ContextMap): void {
  ensureDir(path.join(root, ".claude", "commands"));
  ensureDir(path.join(root, ".claude", "agents"));
  ensureDir(path.join(root, ".claude", "skills"));

  writeFileSync(path.join(root, ".claude", "CLAUDE.md"), claudeRouterTemplate(context), "utf8");
  writeJson(path.join(root, ".claude", "settings.json"), claudeSettingsTemplate());

  writeFileSync(path.join(root, ".claude", "commands", "haus.md"), hausCommandTemplate(), "utf8");
  writeFileSync(path.join(root, ".claude", "commands", "haus-doctor.md"), hausDoctorCommandTemplate(), "utf8");
  writeFileSync(path.join(root, ".claude", "commands", "haus-explain-context.md"), hausExplainContextCommandTemplate(), "utf8");
  writeFileSync(path.join(root, ".claude", "commands", "haus-review.md"), hausReviewCommandTemplate(), "utf8");
}

function copySelectedResources(root: string, context: ContextMap): void {
  for (const item of context.selectedCatalogItems) {
    if (item.installMode !== "copy-selected") continue;
    const source = path.join(packageRoot, item.path);
    if (!existsSync(source)) continue;

    if (item.type === "skill") {
      const dest = path.join(root, ".claude", "skills", path.basename(source));
      replaceCopy(source, dest);
    }
    if (item.type === "agent") {
      const dest = path.join(root, ".claude", "agents", path.basename(source));
      replaceCopy(source, dest);
    }
  }
}

function plannedWrites(root: string, context: ContextMap): string[] {
  const files = [
    path.join(root, ".claude", "CLAUDE.md"),
    path.join(root, ".claude", "settings.json"),
    path.join(root, ".claude", "commands", "haus.md"),
    path.join(root, ".claude", "commands", "haus-doctor.md"),
    path.join(root, ".claude", "commands", "haus-explain-context.md"),
    path.join(root, ".claude", "commands", "haus-review.md")
  ];
  for (const item of context.selectedCatalogItems) {
    if (item.installMode !== "copy-selected") continue;
    const source = path.join(packageRoot, item.path);
    if (!existsSync(source)) continue;
    if (item.type === "skill") files.push(path.join(root, ".claude", "skills", path.basename(source)));
    if (item.type === "agent") files.push(path.join(root, ".claude", "agents", path.basename(source)));
  }
  return files;
}

function claudeRouterTemplate(context: ContextMap): string {
  return `# Haus AI Router\n\nThis project uses the Haus AI workflow package.\n\nDo not load broad context manually. Start from:\n\n- .haus-ai/context-map.json\n- .haus-ai/repo-summary.md\n- .haus-ai/selected-context.json\n\nDetected repo roles: ${context.repoRoles.join(", ") || "unknown"}\nPackage manager: ${context.packageManager}\nSelected context estimate: ${context.tokenEstimate} tokens\n\nRules:\n\n1. Use only Haus context selected for this repo.\n2. Ignore stacks that were not detected.\n3. Never read .env, .env.*, private keys, dumps, uploads, customer exports, production logs, or credentials.\n4. Prefer small diffs.\n5. Add or update tests for behavior changes.\n6. Run relevant validation before calling work done.\n7. If validation was not run, say that clearly.\n\nUseful commands:\n\n\`\`\`bash\nhaus-ai doctor\nhaus-ai explain-context\nhaus-ai context --task "describe task here"\n\`\`\`\n`;
}

function claudeSettingsTemplate(): JsonObject {
  return {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [{ type: "command", command: "haus-ai context --from-hook", timeout: 5 }]
        }
      ],
      PreToolUse: [
        {
          matcher: "Read|Edit|MultiEdit|Write",
          hooks: [{ type: "command", command: "haus-ai guard file-access --from-hook", timeout: 5 }]
        },
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "haus-ai guard bash --from-hook", timeout: 5 }]
        }
      ]
    }
  };
}

function hausCommandTemplate(): string {
  return `---\ndescription: Run the Haus AI workflow for a coding task using selected project context.\nallowed-tools: Bash(haus-ai context:*), Bash(haus-ai doctor:*), Bash(git diff:*), Bash(git status:*)\n---\n\n# Haus Workflow\n\nTask:\n\n$ARGUMENTS\n\nSteps:\n\n1. Run \`haus-ai context --task "$ARGUMENTS"\`.\n2. Explain which context you will use and why.\n3. Make a short implementation plan.\n4. Make the smallest safe change.\n5. Run relevant validation.\n6. Summarize changed files, validation results, and remaining risks.\n`;
}

function hausDoctorCommandTemplate(): string {
  return `---\ndescription: Show Haus AI project detection, selected context, warnings, and token estimate.\nallowed-tools: Bash(haus-ai doctor:*)\n---\n\nRun \`haus-ai doctor\` and explain warnings clearly.\n`;
}

function hausExplainContextCommandTemplate(): string {
  return `---\ndescription: Explain why Haus AI selected each skill, agent, rule, and context file.\nallowed-tools: Bash(haus-ai explain-context:*)\n---\n\nRun \`haus-ai explain-context\` and summarize selected and skipped context.\n`;
}

function hausReviewCommandTemplate(): string {
  return `---\ndescription: Review current changes using Haus quality, security, and production-readiness standards.\nallowed-tools: Bash(haus-ai context:*), Bash(git diff:*), Bash(git status:*)\n---\n\nReview the current git diff.\n\nFocus on correctness, security, maintainability, tests, accessibility if frontend, performance if relevant, and production risks.\n\nUse context from:\n\n\`\`\`bash\nhaus-ai context --task "code review"\n\`\`\`\n`;
}

function repoSummary(context: ContextMap): string {
  return `# Repo summary\n\nGenerated: ${context.generatedAt}\n\nRepo: ${context.repoName}\nRoles: ${context.repoRoles.join(", ") || "unknown"}\nPackage manager: ${context.packageManager}\nConfidence: ${context.confidence}\n\n## Detected stacks\n\n${Object.entries(context.detectedStacks).filter(([, values]) => values.length).map(([group, values]) => `- ${group}: ${values.join(", ")}`).join("\n")}\n\n## Selected context\n\n${context.selectedCatalogItems.map((item) => `- ${item.id}: ${item.reason}`).join("\n")}\n\n## Warnings\n\n${context.warnings.length ? context.warnings.map((warning) => `- ${warning}`).join("\n") : "None"}\n`;
}

function readContextOrScan(root: string): ContextMap {
  const file = path.join(root, ".haus-ai", "context-map.json");
  if (existsSync(file)) return readJsonSafe(file) as ContextMap;
  return scanCommand(root, false);
}

function loadCatalog(): CatalogItem[] {
  const file = path.join(libraryRoot, "catalog", "manifest.json");
  const parsed = readJsonSafe(file);
  if (!parsed || !Array.isArray(parsed.items)) fail(`Could not read catalog manifest at ${file}`);
  return parsed.items as CatalogItem[];
}

function collectDependencies(pkg?: JsonObject, composer?: JsonObject): string[] {
  const names = new Set<string>();
  const addKeys = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const key of Object.keys(value)) names.add(key);
  };
  addKeys(pkg?.dependencies);
  addKeys(pkg?.devDependencies);
  addKeys(pkg?.peerDependencies);
  addKeys(pkg?.optionalDependencies);
  addKeys(composer?.require);
  addKeys(composer?.["require-dev"]);
  return Array.from(names);
}

function detectPackageManager(root: string, pkg?: JsonObject): "pnpm" | "yarn" | "npm" | "unknown" {
  const pm = typeof pkg?.packageManager === "string" ? pkg.packageManager : "";
  if (pm.startsWith("pnpm") || existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (pm.startsWith("yarn") || existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (pm.startsWith("npm") || existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

function collectImportantFileHashes(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of listFiles(root, { maxFiles: 1000, maxDepth: 4 })) {
    const base = path.basename(file);
    if (!IMPORTANT_FILE_NAMES.has(base) && !file.endsWith(".csproj") && !file.endsWith(".sln") && !file.endsWith(".graphql")) continue;
    const rel = path.relative(root, file);
    result[rel] = hashFile(file);
  }
  return result;
}

function containsInSafeFiles(root: string, needle: string, extensions: string[], maxFiles: number): boolean {
  let checked = 0;
  for (const file of listFiles(root, { maxFiles: 2000, maxDepth: 6 })) {
    if (checked >= maxFiles) return false;
    if (isSensitivePath(path.relative(root, file))) continue;
    const base = path.basename(file);
    const ext = path.extname(file);
    const matchesExt = extensions.includes(ext) || extensions.some((candidate) => base.endsWith(candidate));
    if (!matchesExt) continue;
    checked += 1;
    const text = readTextSafe(file);
    if (text?.includes(needle)) return true;
  }
  return false;
}

function hasSourceExtension(root: string, extensions: string[]): boolean {
  return listFiles(root, { maxFiles: 1000, maxDepth: 5 }).some((file) => extensions.includes(path.extname(file)));
}

function listFiles(root: string, options: { maxFiles: number; maxDepth: number }): string[] {
  const files: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (files.length >= options.maxFiles || depth > options.maxDepth) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= options.maxFiles) return;
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      const rel = path.relative(root, full);
      if (isSensitivePath(rel)) continue;
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) visit(full, depth + 1);
      else if (stat.isFile()) files.push(full);
    }
  };
  visit(root, 0);
  return files;
}

function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes(".env.example")) return false;
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function denyHook(reason: string): void {
  console.log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason }));
  process.exit(0);
}

function wildcardMatch(value: string, pattern: string): boolean {
  const regex = new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`);
  return regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortStacks(stacks: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(stacks).map(([key, values]) => [key, Array.from(new Set(values)).sort()]));
}

function readJsonSafe(file: string): JsonObject | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as JsonObject;
  } catch {
    return undefined;
  }
}

function readTextSafe(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function replaceCopy(source: string, dest: string): void {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  ensureDir(path.dirname(dest));
  cpSync(source, dest, { recursive: true });
}

function hashFile(file: string): string {
  return crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readStdinIfAny(): string {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main();
*/
