import fs from "fs-extra";
import path from "node:path";
import type { PackageManager } from "../types.js";
import { satisfiesVersion } from "../utils/versions.js";

export function detectPackageManager(root: string, packageManagerField?: string): PackageManager {
  const field = String(packageManagerField ?? "").trim();
  if (field.startsWith("yarn@")) {
    const version = field.slice("yarn@".length);
    if (satisfiesVersion(version, ">=4 <5")) return "yarn";
    return "unknown";
  }
  if (field.startsWith("pnpm@")) {
    const version = field.slice("pnpm@".length);
    if (satisfiesVersion(version, ">=8 <10")) return "pnpm";
    return "unknown";
  }
  if (field.startsWith("npm@")) {
    const version = field.slice("npm@".length);
    if (satisfiesVersion(version, ">=9")) return "npm";
    return "unknown";
  }
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}
