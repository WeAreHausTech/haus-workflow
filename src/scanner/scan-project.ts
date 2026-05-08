import path from "node:path";
import fs from "fs-extra";
import { hashText, listFiles, readJson, readText, writeJson, writeText } from "../utils/fs.js";
import { readFile } from "node:fs/promises";
import { hausPath } from "../utils/paths.js";
import type { ContextMap, PackageManager } from "../types.js";
import type { ScanResult } from "./types.js";

const SAFE_FILES = [
  "package.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.json",
  "composer.lock",
  "nx.json",
  "turbo.json",
  "tsconfig.json",
  "vite.config.*",
  "next.config.*",
  "tailwind.config.*",
  "components.json",
  "playwright.config.*",
  "phpunit.xml",
  "artisan",
  "routes/*.php",
  "app/Providers/*.php",
  "schema.graphql",
  "**/*.graphql",
  "**/vendure-config.*",
  "**/*module.ts",
  "web/app/**",
  "wp-content/**",
  ".storybook/**",
  ".env.example",
  "wp-config.php",
  "**/*.csproj",
  "**/*.sln",
  "docker-compose.*",
  "Dockerfile"
];

const SENSITIVE = [/^\.env(\.|$)/, /(^|\/)\.env(\.|$)/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /\.sql$/, /\.dump$/, /customer-data/, /exports/, /certs/, /secrets/];

function blocked(rel: string): boolean {
  return SENSITIVE.some((x) => x.test(rel));
}

export async function scanProject(root: string, mode: "guided" | "fast" = "fast"): Promise<ScanResult> {
  const pkg = await readJson<Record<string, unknown>>(path.join(root, "package.json"));
  const composer = await readJson<Record<string, unknown>>(path.join(root, "composer.json"));
  const files = await listFiles(root, SAFE_FILES);
  const safeFiles = files.filter((f) => !blocked(f));
  const deps = dependencySet(pkg, composer);
  const packageManager = detectPackageManager(root, pkg);
  const roles = detectRoles(deps, safeFiles);
  const stacks = await detectStacks(root, deps, safeFiles);
  const warnings: string[] = [];
  const securityRisks: string[] = [];
  const crossRepoHints: string[] = [];
  if (!safeFiles.some((f) => f.endsWith(".env.example"))) warnings.push("No .env.example found");
  if (!(pkg && typeof pkg === "object" && "scripts" in pkg && String((pkg as any).scripts?.test ?? "").length > 0)) warnings.push("No package.json test script found");
  if (safeFiles.some((f) => f.includes("docker-compose"))) crossRepoHints.push("Containerized services detected");
  if (safeFiles.some((f) => f.includes("turbo.json") || f.includes("nx.json"))) crossRepoHints.push("Monorepo orchestration detected");
  if (!safeFiles.some((f) => f.endsWith(".env.example"))) securityRisks.push("Missing env template");
  if (safeFiles.some((f) => f.includes("wp-content/uploads"))) securityRisks.push("Uploads directory present");

  const context: ContextMap = {
    mode,
    generatedAt: new Date().toISOString(),
    root,
    repoName: String(pkg?.name ?? path.basename(root)),
    packageManager,
    repoRoles: roles,
    confidence: computeConfidence(roles, stacks),
    detectedStacks: stacks,
    dependencies: deps,
    securityRisks,
    crossRepoHints,
    warnings
  };

  const dependencyMap = {
    node: deps.filter((d) => !d.includes("/")),
    composer: Object.keys(((composer?.require ?? {}) as Record<string, string>) ?? {})
  };
  const scanHashes = Object.fromEntries(
    await Promise.all(
      safeFiles.map(async (f) => [f, hashText(await readFile(path.join(root, f), "utf8"))] as const)
    )
  );
  const repoSummary = renderSummary(context);

  await writeJson(hausPath(root, "context-map.json"), context);
  await writeJson(hausPath(root, "dependency-map.json"), dependencyMap);
  await writeJson(hausPath(root, "scan-hashes.json"), scanHashes);
  await writeText(hausPath(root, "repo-summary.md"), repoSummary);

  return { ...context, dependencyMap, scanHashes, repoSummary };
}

function dependencySet(pkg?: Record<string, unknown>, composer?: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const pushObj = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj as Record<string, unknown>)) out.add(key);
  };
  pushObj(pkg?.dependencies);
  pushObj(pkg?.devDependencies);
  pushObj(composer?.require);
  pushObj(composer?.["require-dev"]);
  return [...out].sort();
}

function detectPackageManager(root: string, pkg?: Record<string, unknown>): PackageManager {
  const pm = String(pkg?.packageManager ?? "");
  if (pm.startsWith("yarn")) return "yarn";
  if (pm.startsWith("pnpm")) return "pnpm";
  if (pm.startsWith("npm")) return "npm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

function detectRoles(deps: string[], files: string[]): string[] {
  const roles = new Set<string>();
  if (deps.includes("next") || files.some((f) => f.includes("next.config."))) roles.add("next-app");
  if (deps.includes("react")) roles.add("react-app");
  if (deps.includes("vite") || files.some((f) => f.includes("vite.config."))) roles.add("vite-app");
  if (deps.includes("@vendure/core")) roles.add("vendure-app");
  if (deps.some((d) => d.startsWith("@haus/vendure-")) || files.some((f) => f.includes("vendure-config"))) roles.add("vendure-plugin");
  if (deps.includes("@nestjs/core")) roles.add("nestjs-api");
  if (deps.includes("graphql") || deps.includes("@nestjs/graphql")) roles.add("graphql-api");
  if (files.some((f) => f.endsWith("nx.json"))) roles.add("nx-monorepo");
  if (files.some((f) => f.endsWith("turbo.json"))) roles.add("turbo-monorepo");
  if (files.some((f) => f.endsWith("artisan")) || deps.includes("laravel/framework")) roles.add("laravel-app");
  if (deps.includes("laravel/nova")) roles.add("laravel-nova-app");
  if (files.some((f) => f.endsWith("wp-config.php")) && files.some((f) => f.includes("web/app"))) roles.add("wordpress-bedrock-site");
  if (files.some((f) => f.endsWith("wp-config.php")) && !files.some((f) => f.includes("web/app"))) roles.add("wordpress-vanilla-site");
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) roles.add("dotnet-service");
  if (deps.includes("express")) roles.add("express-service");
  return [...roles].sort();
}

async function detectStacks(root: string, deps: string[], files: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = { backend: [], frontend: [], databases: [], testing: [], auth: [], tooling: [], packageManagers: [] };
  const add = (k: string, v: string) => {
    out[k] ??= [];
    if (!out[k].includes(v)) out[k].push(v);
  };
  if (deps.includes("next")) add("frontend", "nextjs");
  if (deps.includes("react")) add("frontend", "react19");
  if (deps.includes("vue")) add("frontend", "vue");
  if (deps.includes("vite")) add("frontend", "vite8");
  if (deps.includes("@vendure/core")) add("backend", "vendure3");
  if (deps.includes("@nestjs/core")) add("backend", "nestjs");
  if (await hasNeedle(root, files, "NestFactory")) add("backend", "nestjs");
  if (await hasNeedle(root, files, "@VendurePlugin")) add("backend", "vendure3");
  if (deps.includes("graphql") || deps.includes("@nestjs/graphql")) add("backend", "graphql");
  if (files.some((f) => f.endsWith(".graphql") || f.endsWith("schema.graphql"))) add("backend", "graphql");
  if (deps.includes("laravel/framework")) add("backend", "laravel");
  if (files.some((f) => f.includes("app/Providers/") || f.includes("routes/"))) add("backend", "laravel");
  if (files.some((f) => f.endsWith("wp-config.php"))) add("backend", "wordpress");
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) add("backend", "dotnet");
  if (deps.includes("@playwright/test")) add("testing", "playwright");
  if (files.some((f) => f.includes(".storybook"))) add("testing", "storybook");
  if (deps.some((d) => d.startsWith("@testing-library/"))) add("testing", "testing-library");
  if (files.some((f) => f.endsWith("phpunit.xml"))) add("testing", "phpunit");
  if (deps.some((d) => d.startsWith("@storybook/"))) add("testing", "storybook");
  if (deps.includes("pg")) add("databases", "postgresql");
  if (deps.includes("mariadb") || deps.includes("mysql2")) add("databases", "mariadb");
  if (deps.includes("mssql")) add("databases", "mssql");
  if (deps.includes("@elastic/elasticsearch")) add("databases", "elasticsearch");
  if (await hasNeedle(root, files, "openid")) add("auth", "oidc");
  if (await hasNeedle(root, files, "AZURE_AD")) add("auth", "azure-ad");
  if (await hasNeedle(root, files, "BANKID")) add("auth", "bankid");
  add("packageManagers", "yarn4");
  return out;
}

async function hasNeedle(root: string, files: string[], needle: string): Promise<boolean> {
  const candidates = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".php") || f.endsWith(".json") || f.endsWith(".yml") || f.endsWith(".yaml"));
  for (const rel of candidates.slice(0, 300)) {
    try {
      const content = await readFile(path.join(root, rel), "utf8");
      if (content.includes(needle)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function computeConfidence(roles: string[], stacks: Record<string, string[]>): number {
  const stackCount = Object.values(stacks).reduce((sum, arr) => sum + arr.length, 0);
  if (roles.length === 0) return 0.15;
  return Math.min(0.99, Number((0.4 + roles.length * 0.08 + stackCount * 0.02).toFixed(2)));
}

function renderSummary(context: ContextMap): string {
  return `# Repo summary

- Repo: ${context.repoName}
- Package manager: ${context.packageManager}
- Roles: ${context.repoRoles.join(", ") || "unknown"}
- Generated: ${context.generatedAt}
`;
}
