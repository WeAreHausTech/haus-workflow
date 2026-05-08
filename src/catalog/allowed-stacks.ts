import { readJson } from "../utils/fs.js";

export async function readAllowedStacks(root: string): Promise<string[]> {
  const data = await readJson<{ stacks: string[] }>(`${root}/library/catalog/allowed-stacks.json`);
  return data?.stacks ?? [];
}
