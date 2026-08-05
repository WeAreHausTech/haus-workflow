/** Shared `--only <repos>` filtering, used by both `add` and `hydrate`. */
import type { Member } from '../members.js'

export type MemberSelection = { selected: Member[]; unknown: string[] }

/**
 * Filters `members` down to those matching `only` (by `id` or `folder`).
 * `unknown` lists any requested name that matched nothing — callers should
 * surface this as an error rather than silently ignoring a typo.
 */
export function selectMembers(members: Member[], only?: string[]): MemberSelection {
  if (!only || only.length === 0) return { selected: members, unknown: [] }
  const wanted = new Set(only)
  const selected = members.filter((m) => wanted.has(m.id) || wanted.has(m.folder))
  const matchedKeys = new Set<string>()
  for (const m of selected) {
    if (wanted.has(m.id)) matchedKeys.add(m.id)
    if (wanted.has(m.folder)) matchedKeys.add(m.folder)
  }
  const unknown = only.filter((name) => !matchedKeys.has(name))
  return { selected, unknown }
}
