/** `haus setup-project` — fast full setup: scan, recommend, and optionally apply Claude files. */
import { runSetupCore } from '../claude/setup-core.js'
import { confirm } from '../utils/prompts.js'

/**
 * Runs full project setup: scan, recommend, doctor summary, and apply.
 * Prompts the user to confirm before writing files unless --json is passed.
 * `--force` opts into writing recommendation.json/haus.lock.json even when zero
 * catalog items matched at all (see the zero-signal setup guard in setup-core.ts).
 */
export async function runSetupProject(options: { json?: boolean; force?: boolean }): Promise<void> {
  const root = process.cwd()

  // In --json mode preview only (apply:false). Interactive mode applies after a
  // confirm() gate run inside the core, after the scan/recommend/doctor summary.
  await runSetupCore(root, {
    json: options.json,
    apply: !options.json,
    dryRun: false,
    force: options.force,
    confirm: () => confirm('Approve and write Claude files now?'),
  })
}
