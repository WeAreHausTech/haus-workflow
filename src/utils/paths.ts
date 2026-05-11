import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HAUS_DIR = ".haus-ai";

export function cwd(): string {
  return process.cwd();
}

export function hausPath(root: string, ...parts: string[]): string {
  return path.join(root, HAUS_DIR, ...parts);
}

export function claudePath(root: string, ...parts: string[]): string {
  return path.join(root, ".claude", ...parts);
}

/** Resolves the `@haus/ai` package root (works when bundled as `dist/cli.js` or as `dist/utils/*.js`). */
export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "@haus/ai") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const file = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(file), "../..");
}
