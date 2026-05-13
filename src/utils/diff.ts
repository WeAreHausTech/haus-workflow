import { createTwoFilesPatch } from "diff";

export function hasTextChanged(before: string, after: string): boolean {
  return before !== after;
}

export function createUnifiedDiff(filePath: string, before: string, after: string): string {
  return createTwoFilesPatch(filePath, filePath, before, after, "before", "after", {
    context: 3,
  });
}

export function summarizeDiff(diffText: string): { additions: number; deletions: number } {
  const lines = diffText.split("\n");
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}
