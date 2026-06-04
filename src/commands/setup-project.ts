/** `haus setup-project` — interactive or fast full setup: scan, recommend, and optionally apply Claude files. */
import { readJson, writeJson } from '../utils/fs.js'
import { log } from '../utils/logger.js'
import { hausPath } from '../utils/paths.js'
import { ask, confirm } from '../utils/prompts.js'

import { runSetupCore } from './setup-core.js'

const GUIDED_QUESTIONS = [
  'What is this project for?',
  'Is it for a client, internal Haus work, or experimentation?',
  'What should Claude help with most?',
  'Is this project connected to other repositories?',
  'Are there parts of the project Claude should avoid touching?',
  'Are there client-specific rules or sensitive areas?',
  'Do you want a minimal, standard, or strict setup?',
]

/**
 * Runs full project setup: optional guided Q&A, scan, recommend, doctor summary, and apply.
 * Prompts the user to confirm before writing files unless --json is passed.
 */
export async function runSetupProject(options: {
  guided?: boolean
  fast?: boolean
  json?: boolean
}): Promise<void> {
  const root = process.cwd()
  let mode: 'guided' | 'fast' = options.guided ? 'guided' : 'fast'
  if (!options.guided && !options.fast && !options.json) {
    log('How do you want to set this project up?')
    log("1. Guided setup - I'll ask a few simple questions, then scan the project.")
    log("2. Fast setup - I'll only scan the project and recommend defaults.")
    const choice = await ask('Choose 1 or 2')
    mode = choice === '1' ? 'guided' : 'fast'
  }

  if (mode === 'guided') {
    const existing =
      (await readJson<Record<string, string>>(hausPath(root, 'setup-answers.json'))) ?? {}
    const merged: Record<string, string> = {}
    for (const question of GUIDED_QUESTIONS) {
      if (options.json) {
        merged[question] = existing[question] ?? 'pending-user-answer'
        continue
      }
      // If an answer was pre-supplied (e.g. the agent wrote setup-answers.json
      // conversationally on the user's behalf), use it and skip the readline prompt.
      // TTY users with no pre-filled answer are still prompted as before.
      const prefilled = existing[question]
      if (prefilled && prefilled !== 'pending-user-answer' && prefilled !== 'no-answer') {
        merged[question] = prefilled
        continue
      }
      const answer = await ask(question)
      merged[question] = answer || prefilled || 'no-answer'
    }
    await writeJson(hausPath(root, 'setup-answers.json'), merged)
  }

  // In --json mode preview only (apply:false). Interactive modes apply after a
  // confirm() gate run inside the core, after the scan/recommend/doctor summary.
  await runSetupCore(root, {
    mode,
    json: options.json,
    apply: !options.json,
    dryRun: false,
    confirm: () => confirm('Approve and write Claude files now?'),
  })
}
