/**
 * Public API for the remote haus-workflow-catalog integration. Re-exports from the
 * split modules under `remote-catalog/` — see that directory for implementation.
 * This file's export surface must stay identical to what it was before the split
 * (audit R2): every existing importer in the codebase keeps working unchanged.
 */
import { _resetBlobPathCacheForTests } from './remote-catalog/github-tree.js'
import { _resetRefCacheForTests } from './remote-catalog/ref.js'

export {
  getCacheDir,
  getBundledCatalogRef,
  getResolvedCatalogRef,
  isCatalogRefResolved,
  resolveCatalogRef,
  fetchLatestCatalogTag,
} from './remote-catalog/ref.js'
export { fetchRemoteManifest } from './remote-catalog/manifest.js'
export { WORKFLOW_TEMPLATE_REL, readWorkflowTemplate } from './remote-catalog/workflow-template.js'
export { fetchCatalogBlobPaths, listFilesUnderCatalogPrefix } from './remote-catalog/github-tree.js'
export { syncRemoteCatalog, getCacheManifestAge, type SyncResult } from './remote-catalog/sync.js'

/** Test-only: clears all module-level catalog caches between isolated test runs. */
export function _resetRemoteCatalogCachesForTests(): void {
  _resetRefCacheForTests()
  _resetBlobPathCacheForTests()
}
