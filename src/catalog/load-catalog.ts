import path from "node:path";
import { readJson } from "../utils/fs.js";
import type { CatalogItem } from "../types.js";

export async function loadCatalog(root: string): Promise<CatalogItem[]> {
  const data = await readJson<{ items: CatalogItem[] }>(path.join(root, "library/catalog/manifest.json"));
  return data?.items ?? [];
}
