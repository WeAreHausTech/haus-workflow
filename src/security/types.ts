/** Shared result types for bash and file-access guards. */

/** Decision returned by a guard; `reason` is set when `allowed` is false. */
export type GuardDecision = { allowed: boolean; reason?: string }
