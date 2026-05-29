/** `haus catalog-audit` — checks the bundled catalog manifest for unsupported or forbidden stacks. */
import { loadCatalog } from '../catalog/load-catalog.js'
import { error, log } from '../utils/logger.js'

const FORBIDDEN = [
  'python',
  'django',
  'go',
  'rust',
  'java',
  'spring',
  'kotlin',
  'swift',
  'android',
  'flutter',
  'dart',
  'c++',
  'perl',
  'defi',
  'trading',
]

/** Audits the bundled catalog for forbidden stack/tag names; exits non-zero on any failure. */
export async function runCatalogAudit(): Promise<void> {
  const items = await loadCatalog(process.cwd())
  const failures: string[] = []
  for (const item of items) {
    const text = `${item.id} ${item.tags.join(' ')}`.toLowerCase()
    for (const word of FORBIDDEN)
      if (text.includes(word)) failures.push(`${item.id} has unsupported tag ${word}`)
  }
  if (failures.length) {
    failures.forEach((f) => error(f))
    process.exitCode = 1
    return
  }
  log('Catalog audit passed.')
}
