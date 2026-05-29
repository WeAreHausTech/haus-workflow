/** Extends ContextMap with the additional artifacts written by scanProject. */
import type { ContextMap } from "../types.js";

/**
 * Full result returned by {@link scanProject} — the ContextMap fields plus the
 * three extra outputs written alongside context-map.json.
 */
export type ScanResult = ContextMap & {
  /** Flat dependency lists keyed by ecosystem (node, composer). */
  dependencyMap: Record<string, string[]>;
  /** SHA-256 hash of every scanned file, used by the lockfile to detect drift. */
  scanHashes: Record<string, string>;
  /** Human-readable markdown summary written to repo-summary.md. */
  repoSummary: string;
};
