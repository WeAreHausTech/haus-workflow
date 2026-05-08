import { readJson } from "../utils/fs.js";

export async function auditSources(root: string): Promise<string[]> {
  const sources = (await readJson<Array<{ id: string; source: string; version?: string; hash?: string }>>(`${root}/library/catalog/sources.json`)) ?? [];
  const issues: string[] = [];
  for (const item of sources) {
    if (!item.version) issues.push(`${item.id}: missing version pin`);
    if (!item.hash) issues.push(`${item.id}: missing hash pin`);
  }
  return issues;
}
