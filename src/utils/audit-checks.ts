/** Shared predicates used by audit scripts to validate catalog and generated content. */

/** Type guard: narrows `unknown` to a plain object (`Record<string, unknown>`). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
