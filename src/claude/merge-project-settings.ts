/**
 * Merges haus hook, deny, and allow rules into the project `.claude/settings.json`
 * without clobbering user-owned entries — same merge model as global `haus install`.
 */
import { buildAllowRules } from '../install/allow-rules.js'
import {
  mergeAllowRules,
  mergeAskRules,
  mergeDenyRules,
  mergeHooks,
  type ClaudeSettings,
  type HookFragment,
} from '../install/settings-merge.js'
import { buildAskRules } from '../security/ask-rules.js'
import { buildDenyRules } from '../security/deny-rules.js'
import {
  backupMalformedJsonFile,
  MalformedJsonFileError,
  readJsonDetailed,
  writeJson,
} from '../utils/fs.js'
import { claudePath } from '../utils/paths.js'

/** Hook fragments derived from the inlined canonical project hook set. */
const PROJECT_HOOK_FRAGMENTS: HookFragment[] = [
  {
    id: 'haus.guard-file',
    gate: 'keep',
    event: 'PreToolUse',
    matcher: 'Read|Edit|Write',
    command: 'haus guard file-access --from-hook',
  },
  {
    id: 'haus.guard-bash',
    gate: 'keep',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'haus guard bash --from-hook',
  },
  {
    id: 'haus.decisions-suggest',
    gate: 'keep',
    event: 'Stop',
    matcher: '*',
    command: 'haus decisions suggest --from-hook',
  },
]

/** Reads project `.claude/settings.json`, returning `{}` when missing. */
export async function readProjectSettings(root: string): Promise<ClaudeSettings> {
  const filePath = claudePath(root, 'settings.json')
  const result = await readJsonDetailed<ClaudeSettings>(filePath)
  if (result.status === 'ok') return result.value
  if (result.status === 'missing') return {}
  const backupPath = await backupMalformedJsonFile(filePath)
  throw new MalformedJsonFileError(filePath, backupPath)
}

export { MalformedJsonFileError } from '../utils/fs.js'

/** Writes the given settings object to project `.claude/settings.json`. */
export async function writeProjectSettings(root: string, settings: ClaudeSettings): Promise<void> {
  await writeJson(claudePath(root, 'settings.json'), settings)
}

/** Returns project settings after merging haus hooks, deny, and allow rules (no write). */
export async function mergeProjectSettings(root: string): Promise<ClaudeSettings> {
  const base = await readProjectSettings(root)
  const { settings: withHooks } = mergeHooks(base, PROJECT_HOOK_FRAGMENTS)
  const { settings: withDeny } = mergeDenyRules(withHooks, buildDenyRules())
  const { settings: withAllow } = mergeAllowRules(withDeny, buildAllowRules())
  const { settings: merged } = mergeAskRules(withAllow, buildAskRules())
  return merged
}

/** Merges haus rules into project settings and writes the result to disk. */
export async function applyProjectSettingsMerge(root: string): Promise<ClaudeSettings> {
  const merged = await mergeProjectSettings(root)
  await writeProjectSettings(root, merged)
  return merged
}
