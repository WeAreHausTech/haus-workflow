import path from "node:path";
import { readText } from "../utils/fs.js";
import type { CuratedSource } from "./types.js";
import YAML from "yaml";

type SourcesYaml = { sources?: CuratedSource[] };

export async function loadSources(root: string): Promise<CuratedSource[]> {
  const file = path.join(root, "library/catalog/sources.yaml");
  const text = await readText(file);
  if (!text) return [];
  const parsed = YAML.parse(text) as SourcesYaml;
  return parsed.sources ?? [];
}
