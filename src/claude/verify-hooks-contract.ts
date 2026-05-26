import { isDeepStrictEqual } from "node:util";

import fs from "fs-extra";

import { readJson } from "../utils/fs.js";
import { claudePath } from "../utils/paths.js";

import type { ClaudeHooksSettings } from "./load-hooks.js";
import { loadClaudeHooksSettings } from "./load-hooks.js";

/** After `apply --write`, ensure disk matches the canonical hook object we intended to write. */
export async function assertPostApplySettingsMatchCanonical(
  root: string,
  canonical: ClaudeHooksSettings,
): Promise<void> {
  const written = await readJson<unknown>(claudePath(root, "settings.json"));
  if (written == null || typeof written !== "object") {
    throw new Error("haus: post-apply self-check failed: .claude/settings.json missing or unreadable");
  }
  if (!isDeepStrictEqual(canonical, written)) {
    throw new Error("haus: post-apply self-check failed: .claude/settings.json does not match canonical hook contract");
  }
}

export type HooksDoctorResult = { ok: boolean; skipped?: boolean; message: string };

/**
 * Compare project `.claude/settings.json` to the canonical hook config.
 */
export async function verifyProjectSettingsHooksContract(root: string): Promise<HooksDoctorResult> {
  const settingsPath = claudePath(root, "settings.json");
  if (!(await fs.pathExists(settingsPath))) {
    return {
      ok: true,
      skipped: true,
      message: "No .claude/settings.json (run `haus apply --write` to install hooks).",
    };
  }
  let canonical: ClaudeHooksSettings;
  try {
    canonical = await loadClaudeHooksSettings();
  } catch (err) {
    return { ok: false, message: `Cannot load canonical hooks: ${String(err)}` };
  }
  const project = await readJson<unknown>(settingsPath);
  if (project == null || typeof project !== "object") {
    return { ok: false, message: ".claude/settings.json is unreadable." };
  }
  if (!isDeepStrictEqual(canonical, project)) {
    return {
      ok: false,
      message: ".claude/settings.json drifts from canonical hook config (regenerate with `haus apply --write`).",
    };
  }
  return { ok: true, message: "settings.json matches canonical hook contract." };
}
