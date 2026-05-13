import type { ContextMap } from "../types.js";
import { readJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

import { scanProject } from "./scan-project.js";

export async function readContextOrScan(root: string): Promise<ContextMap> {
  const context = await readJson<ContextMap>(hausPath(root, "context-map.json"));
  if (context) return context;
  const scan = await scanProject(root, "fast");
  return scan;
}
