import path from "node:path";

import fs from "fs-extra";

import { readText } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";

import { parseMarkdownHeader } from "./header.js";
import { globalClaudeDir, hausManifestPath, readManifest } from "./manifest.js";
import { readSettings, stripHausHooks, writeSettings } from "./settings-merge.js";

export interface UninstallOptions {
  force?: boolean;
}

export interface UninstallResult {
  deleted: string[];
  skipped: string[];
  hooksStripped: boolean;
}

export async function runUninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
  const { force = false } = options;
  const manifest = await readManifest();

  const result: UninstallResult = { deleted: [], skipped: [], hooksStripped: false };

  if (!manifest) {
    warn("No install manifest found — nothing to uninstall.");
    return result;
  }

  for (const entry of manifest.files) {
    const exists = fs.pathExistsSync(entry.destPath);
    if (!exists) continue;

    const content = await readText(entry.destPath);
    if (content === undefined) continue;

    const header = parseMarkdownHeader(content);
    if (!header) {
      warn(`Skipping user-owned file (no HAUS-MANAGED header): ${entry.destPath}`);
      result.skipped.push(entry.destPath);
      continue;
    }

    if (header.stableId !== entry.stableId && !force) {
      warn(`Stable-id mismatch on ${entry.destPath} — skipping. Use --force to delete.`);
      result.skipped.push(entry.destPath);
      continue;
    }

    await fs.remove(entry.destPath);
    await pruneEmptyDir(path.dirname(entry.destPath));
    result.deleted.push(entry.destPath);
  }

  const settings = await readSettings();
  const stripped = stripHausHooks(settings);
  await writeSettings(stripped);
  result.hooksStripped = true;

  const hausDir = path.join(globalClaudeDir(), "haus");
  const manifestPath = hausManifestPath();
  if (fs.pathExistsSync(manifestPath)) {
    await fs.remove(manifestPath);
  }
  if (fs.pathExistsSync(hausDir)) {
    const remaining = await fs.readdir(hausDir);
    if (remaining.length === 0) await fs.remove(hausDir);
  }

  return result;
}

export function printUninstallResult(result: UninstallResult): void {
  if (result.deleted.length) {
    log("Deleted:");
    result.deleted.forEach((p) => log(`  - ${p}`));
  }
  if (result.skipped.length) {
    log("Skipped (user-owned or mismatch):");
    result.skipped.forEach((p) => log(`  ! ${p}`));
  }
  if (result.hooksStripped) {
    log("Haus hook entries removed from ~/.claude/settings.json");
  }
}

async function pruneEmptyDir(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir);
    if (entries.length === 0) await fs.remove(dir);
  } catch {
    /* ignore */
  }
}
