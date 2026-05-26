import crypto from "node:crypto";
import path from "node:path";

import fs from "fs-extra";

import { readText, writeText } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";
import { packageRoot } from "../utils/paths.js";

import { buildMarkdownHeader, parseMarkdownHeader, stampMarkdown } from "./header.js";
import { buildManifest, globalClaudeDir, type ManifestFile, readManifest, writeManifest } from "./manifest.js";
import { loadHooksFragment, mergeHooks, readSettings, writeSettings } from "./settings-merge.js";

const SCHEMA_VERSION = "1";

export interface ApplyOptions {
  dryRun?: boolean;
  force?: boolean;
  check?: boolean;
}

export interface ApplyResult {
  created: string[];
  updated: string[];
  skipped: string[];
  deleted: string[];
  hookIds: string[];
  drift: boolean;
}

function hashContent(content: string): string {
  return `sha256-${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function sourceVersion(): string {
  try {
    const pkgPath = path.join(packageRoot(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string; version?: string };
    return `${pkg.name ?? "haus"}@${pkg.version ?? "0.0.0"}`;
  } catch {
    return "haus@0.0.0";
  }
}

function globalSrcDir(): string {
  return path.join(packageRoot(), "library", "global");
}

interface SourceFile {
  stableId: string;
  srcRelPath: string;
  destPath: string;
}

function collectSourceFiles(srcDir: string, claudeDir: string): SourceFile[] {
  const entries: SourceFile[] = [];

  const skillsDir = path.join(srcDir, "skills");
  if (fs.pathExistsSync(skillsDir)) {
    for (const skillName of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skillName, "SKILL.md");
      if (fs.pathExistsSync(skillFile)) {
        entries.push({
          stableId: `skill.${skillName}`,
          srcRelPath: path.join("library", "global", "skills", skillName, "SKILL.md"),
          destPath: path.join(claudeDir, "skills", skillName, "SKILL.md"),
        });
      }
    }
  }

  const agentsDir = path.join(srcDir, "agents");
  if (fs.pathExistsSync(agentsDir)) {
    for (const agentFile of fs.readdirSync(agentsDir)) {
      if (!agentFile.endsWith(".md")) continue;
      const agentName = agentFile.replace(/\.md$/, "");
      entries.push({
        stableId: `agent.${agentName}`,
        srcRelPath: path.join("library", "global", "agents", agentFile),
        destPath: path.join(claudeDir, "agents", agentFile),
      });
    }
  }

  return entries;
}

export async function applyInstall(options: ApplyOptions = {}): Promise<ApplyResult> {
  const { dryRun = false, force = false, check = false } = options;

  const claudeDir = globalClaudeDir();
  const srcDir = globalSrcDir();
  const source = sourceVersion();

  const existingManifest = await readManifest();
  const manifestByDest = new Map(existingManifest?.files.map((f) => [f.destPath, f]) ?? []);

  const sourceFiles = collectSourceFiles(srcDir, claudeDir);

  const result: ApplyResult = {
    created: [],
    updated: [],
    skipped: [],
    deleted: [],
    hookIds: [],
    drift: false,
  };

  const manifestFiles: ManifestFile[] = [];

  for (const entry of sourceFiles) {
    const srcPath = path.join(packageRoot(), entry.srcRelPath);
    const rawContent = await readText(srcPath);
    if (rawContent === undefined) {
      warn(`Source file not found: ${entry.srcRelPath}`);
      continue;
    }

    const stamped = stampMarkdown(rawContent, {
      stableId: entry.stableId,
      schemaVersion: SCHEMA_VERSION,
      source,
    });
    const newHash = hashContent(stamped);

    const existing = manifestByDest.get(entry.destPath);

    if (check) {
      if (existing && existing.hash !== newHash) {
        result.drift = true;
        result.skipped.push(entry.destPath);
      }
      continue;
    }

    const destExists = fs.pathExistsSync(entry.destPath);

    if (destExists) {
      const currentContent = await readText(entry.destPath);
      if (currentContent !== undefined) {
        const hasHeader = parseMarkdownHeader(currentContent) !== undefined;
        if (!hasHeader) {
          warn(`Refusing to overwrite user-owned file: ${entry.destPath}`);
          result.skipped.push(entry.destPath);
          continue;
        }
        if (existing && hashContent(currentContent) !== existing.hash && !force) {
          warn(`User edited haus file (skipping): ${entry.destPath} — use --force to overwrite`);
          result.skipped.push(entry.destPath);
          manifestFiles.push(existing);
          continue;
        }
        if (existing && existing.hash === newHash && !force) {
          result.skipped.push(entry.destPath);
          manifestFiles.push({ ...existing, hash: newHash });
          continue;
        }
        if (!dryRun) await writeText(entry.destPath, stamped);
        result.updated.push(entry.destPath);
      }
    } else {
      if (!dryRun) await writeText(entry.destPath, stamped);
      result.created.push(entry.destPath);
    }

    manifestFiles.push({
      stableId: entry.stableId,
      destPath: entry.destPath,
      srcRelPath: entry.srcRelPath,
      hash: newHash,
      schemaVersion: SCHEMA_VERSION,
    });
  }

  const fragmentPath = path.join(srcDir, "settings-fragments", "hooks.json");
  const fragments = await loadHooksFragment(fragmentPath);
  const settings = await readSettings();
  const { settings: mergedSettings, addedIds } = mergeHooks(settings, fragments);
  result.hookIds = addedIds;

  // Delete files that were in the old manifest but are no longer in the current package.
  if (!check && existingManifest) {
    const currentDestPaths = new Set(sourceFiles.map((f) => f.destPath));
    for (const entry of existingManifest.files) {
      if (currentDestPaths.has(entry.destPath)) continue;
      if (!fs.pathExistsSync(entry.destPath)) continue;
      const content = await readText(entry.destPath);
      if (!content) continue;
      const hasHeader = parseMarkdownHeader(content) !== undefined;
      const currentHash = hashContent(content);
      if (hasHeader && currentHash === entry.hash) {
        if (!dryRun) await fs.remove(entry.destPath);
        result.deleted.push(entry.destPath);
      } else {
        warn(`Orphaned file ${entry.destPath} was user-modified — leaving in place`);
        result.skipped.push(entry.destPath);
      }
    }
  }

  if (!dryRun && !check) {
    await writeSettings(mergedSettings);
    const manifest = buildManifest(source, manifestFiles, [...(existingManifest?.hooks ?? []), ...addedIds]);
    await writeManifest(manifest);
  }

  return result;
}

export function printApplyResult(result: ApplyResult, dryRun: boolean): void {
  const prefix = dryRun ? "[dry-run] " : "";
  if (result.created.length) {
    log(`${prefix}Created:`);
    result.created.forEach((p) => log(`  + ${p}`));
  }
  if (result.updated.length) {
    log(`${prefix}Updated:`);
    result.updated.forEach((p) => log(`  ~ ${p}`));
  }
  if (result.deleted.length) {
    log(`${prefix}Deleted (orphaned):`);
    result.deleted.forEach((p) => log(`  x ${p}`));
  }
  if (result.skipped.length) {
    log(`${prefix}Skipped:`);
    result.skipped.forEach((p) => log(`  - ${p}`));
  }
  if (result.hookIds.length) {
    log(`${prefix}Hooks added: ${result.hookIds.join(", ")}`);
  }
  if (result.drift) {
    warn("Install drift detected — run `haus install` to sync.");
  }
}

export function buildMarkdownHeaderExport(stableId: string, schemaVersion: string, source: string): string {
  return buildMarkdownHeader({ stableId, schemaVersion, source });
}
