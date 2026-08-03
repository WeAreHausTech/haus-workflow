/** Returns a string[] of former ids, or [] when absent/empty/malformed (soft). */
export function normalizeFormerIds(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length === 0) return []
  if (!value.every((entry) => typeof entry === 'string')) return []
  return value.filter((entry) => entry.length > 0)
}

/** Fail closed when formerIds is present but not a string array. */
function assertFormerIdsShape(
  itemId: string,
  formerIds: unknown,
): asserts formerIds is string[] | undefined {
  if (formerIds === undefined) return
  if (Array.isArray(formerIds) && formerIds.length === 0) return
  if (!Array.isArray(formerIds) || !formerIds.every((entry) => typeof entry === 'string')) {
    throw new Error(`${itemId}: formerIds must be a string array`)
  }
}

/** Builds a lookup from every historical catalog id to its current item id. */
export function buildFormerIdMap(
  items: Array<{ id: string; formerIds?: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>()
  const currentIds = new Set(items.map((item) => item.id))
  for (const item of items) {
    assertFormerIdsShape(item.id, item.formerIds)
    const formerIds = item.formerIds ?? []
    if (!Array.isArray(formerIds) || formerIds.length === 0) continue
    for (const formerId of formerIds) {
      if (currentIds.has(formerId) && formerId !== item.id) {
        throw new Error(
          `formerId ${formerId} on ${item.id} conflicts with another item's current id`,
        )
      }
      const existingOwner = map.get(formerId)
      if (existingOwner !== undefined) {
        throw new Error(
          `duplicate formerId ${formerId} claimed by both ${existingOwner} and ${item.id}`,
        )
      }
      map.set(formerId, item.id)
    }
  }
  return map
}

export type FormerIdMigration = { oldId: string; newId: string }

/** Returns lock ids that have a current catalog alias, preserving lock order. */
export function findFormerIdMigrations(
  lockItems: Array<{ id: string }>,
  manifestItems: Array<{ id: string; formerIds?: string[] }>,
): FormerIdMigration[] {
  const formerIdMap = buildFormerIdMap(manifestItems)
  return lockItems.flatMap(({ id }) => {
    const newId = formerIdMap.get(id)
    return newId === undefined ? [] : [{ oldId: id, newId }]
  })
}
