/**
 * Per-project hook gating config (P2 outcome).
 *
 * `.haus-ai/config.json` carries a small `hooks.*.enabled` map that the
 * non-load-bearing UserPromptSubmit hooks (`context`, `memoryInject`)
 * consult before doing work. Defaults are **off** — the hook is a no-op
 * unless the project opts in.
 *
 * The two safety guards (`guard file-access`, `guard bash`) are NOT gated
 * here: they're load-bearing for the workflow's safety story and stay on
 * unconditionally.
 *
 * See `docs/specs/2026-05-25-hook-cost-report.md` for the audit that
 * motivated this gating.
 */

import path from "node:path";

import { readJson } from "../utils/fs.js";

export type HookKey = "context" | "memoryInject";

export type HooksConfig = {
  hooks?: Partial<Record<HookKey, { enabled?: boolean }>>;
};

const CONFIG_PATH = ".haus-ai/config.json";

/** Default config emitted on `haus apply --write`. Both gated hooks default off. */
export const DEFAULT_HOOKS_CONFIG: Required<HooksConfig> = {
  hooks: {
    context: { enabled: false },
    memoryInject: { enabled: false },
  },
};

/**
 * Read the config and answer: is this hook enabled?
 *
 * The contract is explicitly `enabled: true` (a strict boolean). Anything
 * else — missing file, malformed JSON, missing key, `"true"`/`1`/`{}` —
 * keeps the hook off. The bias is deliberate: a missing or fuzzy config
 * means the project has not opted in, and the hook must stay silent.
 */
export async function isHookEnabled(root: string, key: HookKey): Promise<boolean> {
  const cfg = await readJson<HooksConfig>(path.join(root, CONFIG_PATH));
  return cfg?.hooks?.[key]?.enabled === true;
}
