/** Matches TODO/FIXME/PLACEHOLDER/TBD tokens that must not appear in shipped content. */
export const PLACEHOLDER_RE = /\b(TODO|FIXME|PLACEHOLDER|TBD)\b/i;

/** Type guard: narrows `unknown` to a plain object (`Record<string, unknown>`). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
