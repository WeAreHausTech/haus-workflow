import { createUnifiedDiff, summarizeDiff } from "../utils/diff.js";

export function diffGeneratedFiles(): string {
  return "Generated files may change in .claude/* and .haus-ai/haus.lock.json. Review git diff before apply.";
}

export function summarizeLockDiff(before: string, after: string): string {
  if (before === after) return "No lockfile textual changes.";
  const unified = createUnifiedDiff(".haus-ai/haus.lock.json", before, after);
  const counts = summarizeDiff(unified);
  try {
    const prev = JSON.parse(before || "[]") as Array<{ id: string }>;
    const next = JSON.parse(after || "[]") as Array<{ id: string }>;
    const prevIds = new Set(prev.map((x) => x.id));
    const nextIds = new Set(next.map((x) => x.id));
    const added = [...nextIds].filter((id) => !prevIds.has(id));
    const removed = [...prevIds].filter((id) => !nextIds.has(id));
    if (added.length === 0 && removed.length === 0) return `Lock changed: +${counts.additions} -${counts.deletions} lines`;
    return `Lock item changes: +${added.length} -${removed.length} (lines +${counts.additions} -${counts.deletions})`;
  } catch {
    return `Lock item changes unavailable. Text diff lines: +${counts.additions} -${counts.deletions}`;
  }
}
