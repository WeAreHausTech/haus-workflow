import type { SourceSyncItem } from "./types.js";

export function renderSourceReport(items: SourceSyncItem[]): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: "check-only",
      mutateCatalog: false,
      items
    },
    null,
    2
  );
}
