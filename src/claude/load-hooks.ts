import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";
import { readJson } from "../utils/fs.js";
import { packageRoot } from "../utils/paths.js";

/** Shape written to `.claude/settings.json` under `hooks`. */
export type ClaudeHooksSettings = {
  hooks: {
    UserPromptSubmit: Array<{ hooks: Array<{ type: "command"; command: string }> }>;
    PreToolUse: Array<{ matcher: string; hooks: Array<{ type: "command"; command: string }> }>;
  };
};

const HookCommandSchema = z.object({
  type: z.literal("command"),
  command: z.string()
});

const PluginHooksFileSchema = z.object({
  hooks: z.object({
    UserPromptSubmit: z.array(z.object({ hooks: z.array(HookCommandSchema) })),
    PreToolUse: z.array(z.object({ matcher: z.string(), hooks: z.array(HookCommandSchema) }))
  })
});

/** Canonical copy when `plugin/hooks/hooks.json` is missing from the pack. */
const EMBEDDED_HOOKS: ClaudeHooksSettings = {
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          { type: "command", command: "haus context --from-hook" },
          { type: "command", command: "haus memory inject --from-hook" }
        ]
      }
    ],
    PreToolUse: [
      {
        matcher: "Read|Edit|Write",
        hooks: [{ type: "command", command: "haus guard file-access --from-hook" }]
      },
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: "haus guard bash --from-hook" }]
      }
    ]
  }
};

const STABLE_HOOK_IDS: Record<string, string> = {
  "haus context --from-hook": "haus.context-hook",
  "haus memory inject --from-hook": "haus.memory-hook",
  "haus guard file-access --from-hook": "haus.guard-file",
  "haus guard bash --from-hook": "haus.guard-bash"
};

function validateOrThrow(raw: unknown): ClaudeHooksSettings {
  const parsed = PluginHooksFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid plugin hooks.json: ${parsed.error.message}`);
  }
  return parsed.data as ClaudeHooksSettings;
}

/**
 * Loads `plugin/hooks/hooks.json` from the installed `@haus/ai` package (SSOT).
 * Falls back to embedded hooks if the file is missing.
 */
export async function loadClaudeHooksSettings(): Promise<ClaudeHooksSettings> {
  const hooksPath = path.join(packageRoot(), "plugin", "hooks", "hooks.json");
  if (!(await fs.pathExists(hooksPath))) {
    console.warn("haus: plugin/hooks/hooks.json missing; using embedded hook defaults.");
    // TODO(M5): optional strict mode — fail apply when plugin pack incomplete once packaging is guaranteed.
    return EMBEDDED_HOOKS;
  }
  const raw = await readJson<unknown>(hooksPath);
  if (raw == null) {
    console.warn("haus: plugin/hooks/hooks.json empty or unreadable; using embedded hook defaults.");
    return EMBEDDED_HOOKS;
  }
  try {
    return validateOrThrow(raw);
  } catch (err) {
    console.warn(`haus: invalid hooks file (${hooksPath}); using embedded defaults. ${String(err)}`);
    return EMBEDDED_HOOKS;
  }
}

/** Flat list for `.haus-ai/recommended-hooks.json` (ids stable for known commands). */
export function flattenRecommendedHooks(settings: ClaudeHooksSettings): Array<{ id: string; command: string }> {
  const out: Array<{ id: string; command: string }> = [];
  let generic = 0;
  for (const block of settings.hooks.UserPromptSubmit) {
    for (const h of block.hooks) {
      const id = STABLE_HOOK_IDS[h.command] ?? `haus.hook.user-${generic++}`;
      out.push({ id, command: h.command });
    }
  }
  for (const block of settings.hooks.PreToolUse) {
    for (const h of block.hooks) {
      const id = STABLE_HOOK_IDS[h.command] ?? `haus.hook.pre-${generic++}`;
      out.push({ id, command: h.command });
    }
  }
  return out;
}
