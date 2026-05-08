import fs from "fs-extra";
import path from "node:path";
import type { PackageManager } from "../types.js";

export function detectPackageManager(root: string, packageManagerField?: string): PackageManager {
  if (packageManagerField?.startsWith("yarn")) return "yarn";
  if (packageManagerField?.startsWith("pnpm")) return "pnpm";
  if (packageManagerField?.startsWith("npm")) return "npm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}
