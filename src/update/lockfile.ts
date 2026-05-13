import path from "node:path";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import { readJson, writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { hashInstalledPaths } from "./hash-installed.js";
import { createUnifiedDiff, hasTextChanged } from "../utils/diff.js";
import { normalizeVersion } from "../utils/versions.js";

export type LockItem = {
  id: string;
  type: string;
  source?: string;
  version?: string;
  hash?: string;
  installMode?: string;
  paths?: string[];
  // Curated provenance — populated for source:"curated" items
  originSourceId?: string;
  useMode?: string;
  license?: string;
  riskLevel?: string;
  reviewStatus?: string;
};

export async function checkLock(root: string): Promise<{ ok: boolean; count: number }> {
  const lock = (await readJson<Array<{ id: string; version?: string }>>(hausPath(root, "haus.lock.json"))) ?? [];
  const hasValidVersions = lock.every((item) => !item.version || normalizeVersion(item.version) !== null);
  return { ok: lock.length > 0 && hasValidVersions, count: lock.length };
}

export async function applyLock(root: string): Promise<{ before: string; after: string }> {
  const lockPath = hausPath(root, "haus.lock.json");
  let before = "[]";
  try {
    before = await readFile(lockPath, "utf8");
  } catch {
    before = "[]";
  }
  const lock = (await readJson<LockItem[]>(lockPath)) ?? [];
  try {
    const backupDir = hausPath(root, "backups");
    await mkdir(backupDir, { recursive: true });
    await copyFile(lockPath, path.join(backupDir, `haus.lock.${Date.now()}.json`));
  } catch {
    // no previous lockfile to backup
  }
  const enriched = await Promise.all(
    lock.map(async (x) => {
      const paths = Array.isArray(x.paths) ? x.paths.map(String) : [];
      const { hash: _oldHash, ...stableFields } = x;
      const newHash = await hashInstalledPaths(root, paths);
      return { ...stableFields, paths, hash: newHash };
    })
  );
  await writeJson(lockPath, enriched);
  const after = `${JSON.stringify(enriched, null, 2)}\n`;
  return { before, after };
}

export function diffLock(before: string, after: string): string {
  if (!hasTextChanged(before, after)) return "No lockfile changes.";
  return createUnifiedDiff(".haus-ai/haus.lock.json", before, after);
}

export async function hasLocalOverrides(root: string): Promise<boolean> {
  try {
    await readFile(path.join(root, ".claude", "settings.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}
