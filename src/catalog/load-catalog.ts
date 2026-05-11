import path from "node:path";
import { readJson } from "../utils/fs.js";
import { packageRoot } from "../utils/paths.js";
import type { CatalogItem } from "../types.js";

export async function loadCatalog(root: string): Promise<CatalogItem[]> {
  const localManifest = path.join(root, "library/catalog/manifest.json");
  const packageManifest = path.join(packageRoot(), "library/catalog/manifest.json");
  const data =
    (await readJson<{ items: CatalogItem[] }>(localManifest)) ??
    (await readJson<{ items: CatalogItem[] }>(packageManifest));
  return data?.items ?? [];
}
