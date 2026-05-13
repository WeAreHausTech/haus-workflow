import type { CuratedSource, SourceSyncItem } from "./types.js";

// TODO(M6): Optional network fetch for pinned refs when HAUS_SOURCES_NETWORK=1.
export async function syncPrpmSource(source: CuratedSource, checkOnly: boolean): Promise<SourceSyncItem> {
  return {
    id: source.id,
    source: source.url,
    status: source.status,
    policy: source.policy,
    checkOnly,
    pinned: Boolean(source.pinnedVersion && source.pinnedHash),
    notes: "Catalog metadata check complete. Integration intentionally offline.",
  };
}
