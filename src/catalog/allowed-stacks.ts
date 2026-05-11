import { readJson } from "../utils/fs.js";
import path from "node:path";

export async function readAllowedStacks(root: string): Promise<string[]> {
  const data = await readJson<{ stacks: string[] }>(path.join(root, "library", "catalog", "allowed-stacks.json"));
  return data?.stacks ?? [];
}
