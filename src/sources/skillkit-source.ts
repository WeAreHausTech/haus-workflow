import type { CuratedSource, SourceSyncItem } from "./types.js";

export async function syncSkillkitSource(source: CuratedSource, checkOnly: boolean): Promise<SourceSyncItem> {
  return {
    id: source.id,
    source: source.url,
    status: source.status,
    policy: source.policy,
    checkOnly,
    pinned: Boolean(source.pinnedVersion && source.pinnedHash),
    notes: "Candidate source checked. No mutation performed."
  };
}
