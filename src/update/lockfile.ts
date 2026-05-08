import path from "node:path";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { hashText, readJson, writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

export async function checkLock(root: string): Promise<{ ok: boolean; count: number }> {
  const lock = (await readJson<Array<{ id: string }>>(hausPath(root, "haus.lock.json"))) ?? [];
  return { ok: lock.length > 0, count: lock.length };
}

export async function applyLock(root: string): Promise<void> {
  const lockPath = hausPath(root, "haus.lock.json");
  const lock = (await readJson<Array<Record<string, unknown>>>(lockPath)) ?? [];
  try {
    const backupDir = hausPath(root, "backups");
    await mkdir(backupDir, { recursive: true });
    await copyFile(lockPath, path.join(backupDir, `haus.lock.${Date.now()}.json`));
  } catch {
    // no previous lockfile to backup
  }
  const enriched = lock.map((x) => ({ ...x, hash: hashText(JSON.stringify(x)) }));
  await writeJson(lockPath, enriched);
}

export async function diffLock(root: string): Promise<string> {
  const lockPath = hausPath(root, "haus.lock.json");
  let before = "[]";
  try {
    before = await readFile(lockPath, "utf8");
  } catch {
    before = "[]";
  }
  const after = JSON.stringify((await readJson<Array<Record<string, unknown>>>(lockPath)) ?? [], null, 2);
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
