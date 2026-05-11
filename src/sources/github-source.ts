import type { CuratedSource, SourceSyncItem } from "./types.js";

// TODO(M6): Optional network fetch for pinned refs when HAUS_SOURCES_NETWORK=1.
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
