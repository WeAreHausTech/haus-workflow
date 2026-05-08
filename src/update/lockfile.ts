import { hashText, readJson, writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

export async function checkLock(root: string): Promise<{ ok: boolean; count: number }> {
  const lock = (await readJson<Array<{ id: string }>>(hausPath(root, "haus.lock.json"))) ?? [];
  return { ok: lock.length > 0, count: lock.length };
}

export async function applyLock(root: string): Promise<void> {
  const lock = (await readJson<Array<Record<string, unknown>>>(hausPath(root, "haus.lock.json"))) ?? [];
  const enriched = lock.map((x) => ({ ...x, hash: hashText(JSON.stringify(x)) }));
  await writeJson(hausPath(root, "haus.lock.json"), enriched);
}
