import path from "node:path";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import { readJson, writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { hashInstalledPaths } from "./hash-installed.js";

export type LockItem = {
  id: string;
  type: string;
  source?: string;
  version?: string;
  hash?: string;
  installMode?: string;
  paths?: string[];
};

export async function checkLock(root: string): Promise<{ ok: boolean; count: number }> {
  const lock = (await readJson<Array<{ id: string }>>(hausPath(root, "haus.lock.json"))) ?? [];
  return { ok: lock.length > 0, count: lock.length };
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
  const after = JSON.stringify(enriched, null, 2);
  return { before, after };
}

export function diffLock(before: string, after: string): string {
  if (before.trim() === after.trim()) return "No lockfile changes.";
  return `Lockfile changed: ${before.length} -> ${after.length} bytes`;
}

export async function hasLocalOverrides(root: string): Promise<boolean> {
  try {
    await readFile(path.join(root, ".claude", "settings.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}
