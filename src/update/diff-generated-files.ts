export function diffGeneratedFiles(): string {
  return "Generated files may change in .claude/* and .haus-ai/haus.lock.json. Review git diff before apply.";
}

export function summarizeLockDiff(before: string, after: string): string {
  try {
    const prev = JSON.parse(before || "[]") as Array<{ id: string }>;
    const next = JSON.parse(after || "[]") as Array<{ id: string }>;
    const prevIds = new Set(prev.map((x) => x.id));
    const nextIds = new Set(next.map((x) => x.id));
    const added = [...nextIds].filter((id) => !prevIds.has(id));
    const removed = [...prevIds].filter((id) => !nextIds.has(id));
    if (added.length === 0 && removed.length === 0) return "No lock item add/remove changes.";
    return `Lock item changes: +${added.length} -${removed.length}`;
  } catch {
    return "Lock item changes unavailable.";
  }
}
