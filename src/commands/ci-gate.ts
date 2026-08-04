/**
 * `haus ci-gate` — thin CLI entry point. Aggregation logic lives in
 * `../ci-gate/aggregate.js`, outside `src/commands/`, since it needs `runDoctor` and
 * `runUpdate` from sibling command files — importing them directly from here would
 * violate this directory's own module boundary (docs/architecture.md: command modules
 * "never import from each other").
 */
export { runCiGate } from '../ci-gate/aggregate.js'
