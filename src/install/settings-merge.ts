import path from "node:path";

import fs from "fs-extra";

import { readJson, writeJson } from "../utils/fs.js";

import { globalClaudeDir } from "./manifest.js";

export interface HookFragment {
  id: string;
  gate: "keep" | "gate-default-off";
  event: string;
  matcher?: string;
  command: string;
}

export interface HooksFragmentFile {
  _schema: string;
  hooks: HookFragment[];
}

type ClaudeHookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string }>;
};

type ClaudeSettings = {
  hooks?: Record<string, ClaudeHookEntry[]>;
  _haus?: {
    hooks: string[];
    hookCommands?: string[];
  };
  [key: string]: unknown;
};

export function settingsJsonPath(): string {
  return path.join(globalClaudeDir(), "settings.json");
}

export async function readSettings(): Promise<ClaudeSettings> {
  const parsed = await readJson<ClaudeSettings>(settingsJsonPath());
  return parsed ?? {};
}

export async function writeSettings(settings: ClaudeSettings): Promise<void> {
  await writeJson(settingsJsonPath(), settings);
}

export function mergeHooks(
  settings: ClaudeSettings,
  fragments: HookFragment[],
): { settings: ClaudeSettings; addedIds: string[] } {
  const existing = settings._haus?.hooks ?? [];
  const existingCommands = settings._haus?.hookCommands ?? [];
  const existingSet = new Set(existing);

  const updated = { ...settings };
  updated.hooks = { ...(settings.hooks ?? {}) };

  const addedIds: string[] = [];
  const addedCommands: string[] = [];

  for (const fragment of fragments) {
    if (fragment.gate !== "keep") continue;
    if (existingSet.has(fragment.id)) continue;

    const event = fragment.event;
    if (!updated.hooks[event]) updated.hooks[event] = [];

    const entry: ClaudeHookEntry = {
      hooks: [{ type: "command", command: fragment.command }],
    };
    if (fragment.matcher) entry.matcher = fragment.matcher;

    updated.hooks[event] = [...(updated.hooks[event] ?? []), entry];
    addedIds.push(fragment.id);
    addedCommands.push(fragment.command);
  }

  updated._haus = {
    hooks: [...existing, ...addedIds],
    hookCommands: [...existingCommands, ...addedCommands],
  };

  return { settings: updated, addedIds };
}

export function stripHausHooks(settings: ClaudeSettings): ClaudeSettings {
  const ownedCommands = new Set(settings._haus?.hookCommands ?? []);
  // Fall back to prefix match when hookCommands not recorded (older installs).
  const ownedIds = new Set(settings._haus?.hooks ?? []);
  if (ownedIds.size === 0) return settings;

  const updated = { ...settings };
  updated.hooks = {};

  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    const kept = (entries as ClaudeHookEntry[]).filter((entry) => {
      const cmd = entry.hooks[0]?.command ?? "";
      if (ownedCommands.size > 0) return !ownedCommands.has(cmd);
      return !cmd.startsWith("haus ");
    });
    if (kept.length > 0) updated.hooks[event] = kept;
  }

  const { _haus: _, ...rest } = updated;
  void _;
  return rest;
}

export async function loadHooksFragment(fragmentPath: string): Promise<HookFragment[]> {
  let raw: unknown;
  try {
    raw = await fs.readJson(fragmentPath);
  } catch {
    return [];
  }
  const data = raw as HooksFragmentFile;
  return Array.isArray(data?.hooks) ? data.hooks : [];
}
