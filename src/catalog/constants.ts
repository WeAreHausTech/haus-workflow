/**
 * Shared string constants for catalog fetch and cache paths.
 * Consumed by remote-catalog.ts and load-catalog.ts.
 */

/** Base raw-content URL for the haus-workflow-catalog GitHub repository. */
export const CATALOG_REPO_URL =
  'https://raw.githubusercontent.com/WeAreHausTech/haus-workflow-catalog'

/** GitHub REST API root for the catalog repository (recursive tree listing). */
export const CATALOG_GITHUB_API_URL =
  'https://api.github.com/repos/WeAreHausTech/haus-workflow-catalog'

/** Relative catalog path cached for superpowers cross-skill support files. */
export const SUPERPOWERS_SHARED_CATALOG_REL = 'skills/superpowers/shared'

/**
 * Git ref override for catalog fetch. When unset, the CLI resolves the latest
 * catalog release tag at runtime (see `resolveCatalogRef` in remote-catalog.ts).
 * Example: HAUS_CATALOG_REF=main haus update
 */
export const CATALOG_REF = process.env.HAUS_CATALOG_REF

/** Subdirectory path appended to os.homedir() for the user-level catalog cache. */
export const CATALOG_CACHE_SUBDIR = '.claude/haus/catalog-cache'
