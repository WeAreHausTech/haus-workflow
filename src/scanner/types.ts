import type { ContextMap } from "../types.js";

export type ScanResult = ContextMap & {
  dependencyMap: Record<string, string[]>;
  scanHashes: Record<string, string>;
  repoSummary: string;
};
