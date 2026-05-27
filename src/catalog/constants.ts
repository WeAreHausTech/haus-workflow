export const CATALOG_REPO_URL = "https://raw.githubusercontent.com/wearehaustech/haus-workflow-catalog";

/**
 * Git ref (tag or branch) to fetch the catalog from.
 * Override via HAUS_CATALOG_REF env var to pin to a specific release tag.
 * Example: HAUS_CATALOG_REF=v1.0.0 haus install
 * Defaults to "main" (latest).
 */
export const CATALOG_REF = process.env.HAUS_CATALOG_REF ?? "main";

export const CATALOG_CACHE_SUBDIR = ".claude/haus/catalog-cache";
