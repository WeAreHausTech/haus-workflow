import os from "node:os";
import path from "node:path";

import type { CatalogItem } from "../types.js";
import { readJson } from "../utils/fs.js";
import { packageRoot } from "../utils/paths.js";

import { CATALOG_CACHE_SUBDIR } from "./constants.js";

const CACHE_MANIFEST = path.join(os.homedir(), CATALOG_CACHE_SUBDIR, "manifest.json");

export async function loadCatalog(root: string): Promise<CatalogItem[]> {
  // Env override for isolated test scenarios
  const envPath = process.env["HAUS_FIXTURE_CATALOG"];
  if (envPath) {
    const data = await readJson<{ items: CatalogItem[] }>(envPath);
    return data?.items ?? [];
  }

  // Populated by `haus update` (P8); skip if empty or missing
  const cacheData = await readJson<{ items: CatalogItem[] }>(CACHE_MANIFEST);
  if (cacheData?.items?.length) return cacheData.items;

  // Project-local override (for projects that vendor their own catalog)
  const localManifest = path.join(root, "library/catalog/manifest.json");
  const localData = await readJson<{ items: CatalogItem[] }>(localManifest);
  if (localData?.items?.length) return localData.items;

  // Package-bundled catalog (shipped as decoupled snapshot, updated with each CLI release)
  const packageManifest = path.join(packageRoot(), "library/catalog/manifest.json");
  const data = await readJson<{ items: CatalogItem[] }>(packageManifest);
  return data?.items ?? [];
}
