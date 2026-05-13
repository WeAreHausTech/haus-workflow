import crypto from "node:crypto";
import path from "node:path";

import fg from "fast-glob";
import fs from "fs-extra";

export async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return (await fs.readJson(file)) as T;
  } catch {
    return undefined;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

export async function writeText(file: string, value: string): Promise<void> {
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, value, "utf8");
}

export async function exists(file: string): Promise<boolean> {
  return fs.pathExists(file);
}

export async function listFiles(root: string, patterns: string[]): Promise<string[]> {
  const files = await fg(patterns, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  });
  return files.sort((a, b) => a.localeCompare(b));
}

export function hashText(value: string): string {
  return `sha256-${crypto.createHash("sha256").update(value).digest("hex")}`;
}
