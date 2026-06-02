#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Command } from 'commander'

import { runApply } from './commands/apply.js'
import { runCatalogAudit } from './commands/catalog-audit.js'
import { runConfig } from './commands/config.js'
import { runContext } from './commands/context.js'
import { runDoctor } from './commands/doctor.js'
import { runExplainRecommendation } from './commands/explain-recommendation.js'
import { runGuard } from './commands/guard.js'
import { runInit } from './commands/init.js'
import { runInstall } from './commands/install.js'
import { runRecommend } from './commands/recommend.js'
import { runRefresh } from './commands/refresh.js'
import { runScan } from './commands/scan.js'
import { runSetupProject } from './commands/setup-project.js'
import { runUndo } from './commands/undo.js'
import { runUninstallCommand } from './commands/uninstall.js'
import { runUpdate } from './commands/update.js'
import { runValidateCatalog } from './commands/validate-catalog.js'
import { runWorkspace } from './commands/workspace.js'
import { error } from './utils/logger.js'
import { packageRoot } from './utils/paths.js'
import { satisfiesVersion } from './utils/versions.js'

function cliVersion(): string {
  try {
    const pkgPath = path.join(packageRoot(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const program = new Command()

function validateRuntimeNodeVersion(): void {
  try {
    const pkgPath = path.join(packageRoot(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { engines?: { node?: string } }
    const requiredRange = pkg.engines?.node
    if (requiredRange && !satisfiesVersion(process.version, requiredRange)) {
      throw new Error(`Node ${process.version} does not satisfy required range ${requiredRange}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error(message)
    process.exit(1)
  }
}

validateRuntimeNodeVersion()

program.name('haus').description('Haus AI workflow CLI').version(cliVersion())
program.command('scan').option('--json').action(runScan)
program.command('recommend').option('--json').action(runRecommend)
program
  .command('setup-project')
  .option('--guided')
  .option('--fast')
  .option('--json')
  .action(runSetupProject)
program
  .command('doctor')
  .option('--hooks', 'Verify .claude/settings.json matches the hook contract')
  .action(runDoctor)
program
  .command('apply')
  .option('--dry-run')
  .option('--write')
  .option('--select', 'Interactively select catalog items before applying')
  .option(
    '--allow-empty-cache',
    'Apply core files only when catalog cache is empty (skip catalog items without error)',
  )
  .option(
    '--refill-config',
    'Fill still-blank fields in an existing workflow-config.md without touching edited ones',
  )
  .action(runApply)
program.command('undo').option('-y, --yes', 'Skip confirmation').action(runUndo)
program.command('explain-recommendation').option('--json').action(runExplainRecommendation)
program
  .command('context')
  .option('--task <task>')
  .option('--from-hook')
  .option('--json')
  .option('--verbose')
  .action(runContext)
program.command('init').option('--fast').option('--json').action(runInit)
program.command('refresh').action(runRefresh)
program.command('catalog-audit').action(runCatalogAudit)
program.command('validate-catalog').argument('[manifest]').action(runValidateCatalog)
program.command('update').option('--check').action(runUpdate)
program
  .command('install')
  .option('--dry-run')
  .option('--force')
  .option('--check', 'Exit non-zero if any HAUS-MANAGED file is out of date')
  .action(runInstall)
program.command('uninstall').option('--force').action(runUninstallCommand)

const guard = program.command('guard')
guard
  .command('file-access')
  .option('--from-hook')
  .action((opts) => runGuard('file-access', opts))
guard
  .command('bash')
  .option('--from-hook')
  .action((opts) => runGuard('bash', opts))

const config = program.command('config')
config
  .command('enable <key>')
  .description('Enable a hook (hook.context)')
  .action((key: string) => runConfig(key, 'enable'))
config
  .command('disable <key>')
  .description('Disable a hook (hook.context)')
  .action((key: string) => runConfig(key, 'disable'))
config
  .command('status <key>')
  .description('Show current state of a hook (hook.context)')
  .action((key: string) => runConfig(key, 'status'))

const workspace = program.command('workspace')
workspace.command('init').action(() => runWorkspace('init'))
workspace.command('scan').action(() => runWorkspace('scan'))

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  error(message)
  process.exitCode = 1
})
