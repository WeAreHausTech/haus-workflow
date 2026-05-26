import os from "node:os";
import path from "node:path";

import fs from "fs-extra";

import type { CatalogItem } from "../types.js";
import { warn } from "../utils/logger.js";

import { CATALOG_CACHE_SUBDIR, CATALOG_REF, CATALOG_REPO_URL } from "./constants.js";

// HAUS_CATALOG_CACHE_DIR_OVERRIDE redirects cache writes/reads for isolated tests.
export const CACHE_DIR =
  process.env["HAUS_CATALOG_CACHE_DIR_OVERRIDE"] ?? path.join(os.homedir(), CATALOG_CACHE_SUBDIR);
// HAUS_CATALOG_REMOTE_BASE allows tests to point at a local mock server.
const REMOTE_BASE = process.env["HAUS_CATALOG_REMOTE_BASE"] ?? `${CATALOG_REPO_URL}/${CATALOG_REF}`;
const REMOTE_MANIFEST_URL = `${REMOTE_BASE}/manifest.json`;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchRemoteManifest(): Promise<CatalogItem[] | null> {
  const text = await fetchText(REMOTE_MANIFEST_URL);
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { items?: CatalogItem[] };
    return data?.items?.length ? data.items : null;
  } catch {
    return null;
  }
}

export type SyncResult = {
  newItems: string[];
  unchanged: number;
  failed: string[];
};

export async function syncRemoteCatalog(): Promise<SyncResult> {
  const items = await fetchRemoteManifest();
  if (!items) {
    warn("Remote catalog fetch failed — using bundled catalog");
    return { newItems: [], unchanged: 0, failed: [] };
  }

  await fs.ensureDir(CACHE_DIR);
  await fs.writeFile(path.join(CACHE_DIR, "manifest.json"), `${JSON.stringify({ items }, null, 2)}\n`, "utf8");

  const newItems: string[] = [];
  let unchanged = 0;
  const failed: string[] = [];

  for (const item of items) {
    if ((item.type !== "skill" && item.type !== "agent") || !item.path) continue;

    if (item.type === "skill") {
      const dest = path.join(CACHE_DIR, item.path, "SKILL.md");
      if (await fs.pathExists(dest)) {
        unchanged++;
        continue;
      }
      const url = `${REMOTE_BASE}/${item.path}/SKILL.md`;
      const text = await fetchText(url);
      if (!text) {
        warn(`Failed to fetch content for ${item.id}`);
        failed.push(item.id);
        continue;
      }
      await fs.ensureDir(path.dirname(dest));
      await fs.writeFile(dest, text, "utf8");
      newItems.push(item.id);
    } else {
      const dest = path.join(CACHE_DIR, item.path);
      if (await fs.pathExists(dest)) {
        unchanged++;
        continue;
      }
      const url = `${REMOTE_BASE}/${item.path}`;
      const text = await fetchText(url);
      if (!text) {
        warn(`Failed to fetch content for ${item.id}`);
        failed.push(item.id);
        continue;
      }
      await fs.ensureDir(path.dirname(dest));
      await fs.writeFile(dest, text, "utf8");
      newItems.push(item.id);
    }
  }

  return { newItems, unchanged, failed };
}

// Returns milliseconds since the cache manifest was last written, or null if absent.
export async function getCacheManifestAge(): Promise<number | null> {
  try {
    const stat = await fs.stat(path.join(CACHE_DIR, "manifest.json"));
    return Date.now() - stat.mtimeMs;
  } catch {
    return null;
  }
}
