/** Core shared types used across scanner, recommender, catalog, and writer modules. */

/** Detected package manager for a repository. */
export type PackageManager = 'yarn' | 'pnpm' | 'npm' | 'unknown'

/**
 * How confidently haus recognises the repo's stack.
 * - `supported`: at least one known role/stack and no unsupported-ecosystem markers.
 * - `partial`: known signals AND unsupported markers coexist (e.g. a Python service with a React frontend).
 * - `unknown`: no known role/stack signal — haus cannot confidently guide this repo.
 */
export type DetectionStatus = 'supported' | 'partial' | 'unknown'

/** Scanned repository context written to .haus-workflow/context-map.json. */
export type ContextMap = {
  generatedAt: string
  root: string
  repoName: string
  packageManager: PackageManager
  repoRoles: string[]
  detectedStacks: Record<string, string[]>
  dependencies: string[]
  securityRisks: string[]
  crossRepoHints: string[]
  warnings: string[]
  /** Confidence bucket for stack recognition (drives unsupported-repo messaging). */
  detectionStatus: DetectionStatus
  /** Markers of unsupported ecosystems found in the repo (e.g. ["python"]). Empty when none. */
  unsupportedSignals: string[]
}

/** A single matching clause in a catalog item's requiresAny constraint. */
export type RequiresAnyClause =
  | { stack: string }
  | { dependency: string }
  | { packageNamePattern: string }
  | { role: string }

/** Origin of a catalog item: first-party Haus or curated from an external source. */
export type CatalogItemSource = 'haus' | 'curated'

/** How a curated catalog item was incorporated relative to its upstream source. */
export type CatalogItemUseMode = 'copy' | 'adapted' | 'wrapped' | 'rewritten' | 'reference-only'

/** Curation review gate; only "approved" items may be recommended and installed. */
export type CatalogItemReviewStatus =
  | 'approved'
  | 'candidate'
  | 'needs-review'
  | 'rejected'
  | 'deprecated'

/** Risk level of shipping a curated item; "blocked" items must never be installed. */
export type CatalogItemRiskLevel = 'low' | 'medium' | 'high' | 'blocked'

/** Confidence level of the license determination for a curated catalog item. */
export type CatalogItemLicenseConfidence = 'high' | 'medium' | 'low' | 'unknown'

// Schema: https://raw.githubusercontent.com/WeAreHausTech/haus-workflow-catalog/main/schema/catalog-item.schema.json
// Keep this type in sync with catalog-item.schema.json (haus-workflow-catalog/schema/).
/** A single entry in the catalog manifest describing a skill, agent, template, or command. */
export type CatalogItem = {
  id: string
  type: 'skill' | 'agent' | 'template' | 'command'
  source: string
  version?: string
  path: string
  title?: string
  tags: string[]
  repoRoles: string[]
  installMode?: 'copy-selected' | 'plugin-only'
  purpose?: string
  whenToUse?: string
  whenNotToUse?: string
  references?: string[]
  safetyNotes?: string[]
  sourceInfluences?: Array<{ source: string; idea: string }>
  intents?: string[]
  tokenBudget?: number
  tokenEstimate: number
  /** When true, the item is eligible by default (selected unless a policy gate blocks it). */
  default?: boolean
  /** When present and non-empty, at least one clause must match the scanned context, otherwise the rule is skipped with `requires-any-unsatisfied`. */
  requiresAny?: RequiresAnyClause[]
  /** Optional ecosystem family identifier (e.g. `wordpress`, `laravel`, `vendure`, `nextjs`, `nestjs`, `dotnet`, `nx`, `turbo`). Used by recommender for cross-ecosystem conflict detection. */
  ecosystem?: string
  // Curated external provenance — present when source === "curated"
  /** Catalog source id for this item's origin (e.g. `anthropic-skills`). */
  originSourceId?: string
  /** Direct URL to the upstream source item (file, folder, or page). */
  originUrl?: string
  /** SPDX license identifier, e.g. "MIT", "Apache-2.0". */
  license?: string
  /** Confidence level of the license determination. */
  licenseConfidence?: CatalogItemLicenseConfidence
  /** How this item was incorporated: verbatim copy, adapted for Haus, wrapped, rewritten, or reference-only. */
  useMode?: CatalogItemUseMode
  /** Risk level of shipping this item. Blocked items must not install. */
  riskLevel?: CatalogItemRiskLevel
  /** Review gate status. Only "approved" items may be recommended and installed; "deprecated" is always skipped. */
  reviewStatus?: CatalogItemReviewStatus
  /** Git SHA or version tag pinning the upstream source this item was derived from. */
  pinnedRef?: string
}

/** Known catalog item field names — keep in sync with catalog-item.schema.json. */
export const CATALOG_ITEM_KNOWN_KEYS = [
  'id',
  'type',
  'source',
  'version',
  'path',
  'title',
  'purpose',
  'whenToUse',
  'whenNotToUse',
  'tags',
  'repoRoles',
  'installMode',
  'references',
  'safetyNotes',
  'sourceInfluences',
  'intents',
  'tokenBudget',
  'tokenEstimate',
  'default',
  'requiresAny',
  'ecosystem',
  'originSourceId',
  'originUrl',
  'license',
  'licenseConfidence',
  'useMode',
  'riskLevel',
  'reviewStatus',
  'pinnedRef',
] as const

/**
 * Deep-comprehension signals emitted by the writing-documentation skill to
 * .haus-workflow/deep-context.json. LLM-authored — read defensively. Feeds the
 * second recommendation pass so skills the shallow scanner missed become eligible.
 */
export type DeepContext = {
  generatedAt?: string
  source?: string
  roles?: string[]
  stacks?: Record<string, string[]>
  patterns?: string[]
}

/** Eligibility recommendation result written to .haus-workflow/recommendation.json. */
export type Recommendation = {
  recommended: Array<{
    id: string
    type: string
    reason: string
    reasons: Array<{ code: string; message: string; signal?: string }>
    selectionMode: 'baseline' | 'matched'
    install: boolean
    /** Catalog tags echoed from the manifest entry. Additive optional field. */
    tags?: string[]
    /** Catalog ecosystem family echoed from the manifest entry. Additive optional field. */
    ecosystem?: string
    /** Catalog token estimate echoed from the manifest entry. Additive optional field. */
    tokenEstimate?: number
  }>
  skipped: Array<{
    id: string
    reason: string
    skipReasons: Array<{ code: string; message: string; signal?: string }>
  }>
  warnings: string[]
  estimatedContextTokens: number
  selectedRules: number
  skippedRules: number
  estimatedTokenReductionPct: number
}
