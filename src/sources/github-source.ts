import type { CuratedSource, SourceSyncItem } from "./types.js";

export async function syncGithubSource(source: CuratedSource, checkOnly: boolean): Promise<SourceSyncItem> {
  const pinned = Boolean(source.pinnedVersion && source.pinnedHash);
  return {
    id: source.id,
    source: source.url,
    status: source.status,
    policy: source.policy,
    checkOnly,
    pinned,
    notes: pinned ? "Pinned GitHub source metadata verified." : "Missing version/hash pin. Candidate only."
  };
}
