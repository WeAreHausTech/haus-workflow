/**
 * Shared "which lock-tracked items fell out of the current recommendation" diff.
 * Used by both `haus doctor` (advisory only) and `haus apply --prune` (actually
 * removes them, hash-gated) so the two never compute this set differently.
 */

export type LockEntryLike = { id?: string }

/**
 * Lock entries whose id is not present in `recommendedIds`. An item merely falling
 * out of the current recommendation (project no longer matches its eligibility
 * signals) is distinct from being removed from the catalog manifest entirely —
 * that case is handled separately by `cleanupStaleCatalogItems`.
 */
export function findOrphanedLockEntries<T extends LockEntryLike>(
  lock: T[],
  recommendedIds: Set<string>,
): Array<T & { id: string }> {
  return lock.filter(
    (entry): entry is T & { id: string } =>
      typeof entry.id === 'string' && !recommendedIds.has(entry.id),
  )
}
