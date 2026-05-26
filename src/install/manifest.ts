import os from "node:os";
import path from "node:path";

import { readJson, writeJson } from "../utils/fs.js";

export const MANIFEST_SCHEMA = "haus-install-manifest/1";

export interface ManifestFile {
  stableId: string;
  destPath: string;
  srcRelPath: string;
  hash: string;
  schemaVersion: string;
}

export interface InstallManifest {
  _schema: typeof MANIFEST_SCHEMA;
  source: string;
  installedAt: string;
  files: ManifestFile[];
  hooks: string[];
}

export function globalClaudeDir(): string {
  return path.join(os.homedir(), ".claude");
}

export function hausManifestPath(): string {
  return path.join(globalClaudeDir(), "haus", "install-manifest.json");
}

export async function readManifest(): Promise<InstallManifest | undefined> {
  return readJson<InstallManifest>(hausManifestPath());
}

export async function writeManifest(manifest: InstallManifest): Promise<void> {
  await writeJson(hausManifestPath(), manifest);
}

export function buildManifest(source: string, files: ManifestFile[], hooks: string[]): InstallManifest {
  return {
    _schema: MANIFEST_SCHEMA,
    source,
    installedAt: new Date().toISOString(),
    files,
    hooks,
  };
}
