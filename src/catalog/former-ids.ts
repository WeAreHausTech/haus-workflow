/** Builds a lookup from every historical catalog id to its current item id. */
export function buildFormerIdMap(
  items: Array<{ id: string; formerIds?: string[] }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of items) {
    for (const formerId of item.formerIds ?? []) {
      if (map.has(formerId)) throw new Error(`duplicate formerId ${formerId}`)
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
