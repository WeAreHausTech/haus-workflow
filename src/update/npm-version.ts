/** Fetches the latest published npm version of @haus-tech/haus-workflow to check for updates. */
import { compareVersions, normalizeVersion } from '../utils/versions.js'

/** The npm package name used when querying the registry. */
export const NPM_PACKAGE_NAME = '@haus-tech/haus-workflow'

/** Result of comparing the running package version against the latest on npm. */
export type NpmVersionStatus = {
  current: string
  /** null when the registry is unreachable or returns an unexpected response. */
  latest: string | null
  updateAvailable: boolean
}

/**
 * Queries the npm registry for the latest version of this package and compares
 * it to `currentVersion`. Returns `updateAvailable: false` on any network error.
 */
export async function fetchNpmVersionStatus(currentVersion: string): Promise<NpmVersionStatus> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME)}/latest`,
      {
        signal: AbortSignal.timeout(8_000),
      },
    )
    if (!res.ok) return { current: currentVersion, latest: null, updateAvailable: false }
    const data = (await res.json()) as { version?: string }
    const latest = data?.version
    if (!latest || !normalizeVersion(latest) || !normalizeVersion(currentVersion)) {
      return { current: currentVersion, latest: null, updateAvailable: false }
    }
    const updateAvailable = compareVersions(latest, currentVersion) > 0
    return { current: currentVersion, latest, updateAvailable }
  } catch {
    return { current: currentVersion, latest: null, updateAvailable: false }
  }
}
