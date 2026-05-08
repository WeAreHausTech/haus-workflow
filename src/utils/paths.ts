import path from "node:path";

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
