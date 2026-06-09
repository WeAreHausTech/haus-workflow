/** `haus init` — first-run setup. Delegates to setup-project if .haus-workflow/ does not exist. */
import path from 'node:path'

import fs from 'fs-extra'

import { log } from '../utils/logger.js'

import { runSetupProject } from './setup-project.js'

/** Initializes Haus AI for the first time; no-ops with a message if already initialized. */
export async function runInit(options: { json?: boolean }): Promise<void> {
  const root = process.cwd()
  const hausDir = path.join(root, '.haus-workflow')
  const alreadyInit = await fs.pathExists(hausDir)
  if (alreadyInit) {
    log('Haus AI already initialized in this project.')
    log('Run `haus setup-project` to reconfigure.')
    return
  }
  log('Welcome to Haus AI. Initializing this project for the first time.')
  await runSetupProject(options)
}
