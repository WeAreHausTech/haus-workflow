/** `haus setup-project` — fast full setup: scan, recommend, and optionally apply Claude files. */
import { confirm } from '../utils/prompts.js'

import { runSetupCore } from './setup-core.js'

/**
 * Runs full project setup: scan, recommend, doctor summary, and apply.
 * Prompts the user to confirm before writing files unless --json is passed.
 */
export async function runSetupProject(options: { json?: boolean }): Promise<void> {
  const root = process.cwd()

  // In --json mode preview only (apply:false). Interactive mode applies after a
  // confirm() gate run inside the core, after the scan/recommend/doctor summary.
  await runSetupCore(root, {
    mode: 'fast',
    json: options.json,
    apply: !options.json,
    dryRun: false,
    confirm: () => confirm('Approve and write Claude files now?'),
  })
}
