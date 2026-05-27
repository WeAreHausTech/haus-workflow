import { compareVersions, normalizeVersion } from "../utils/versions.js";

const NPM_PACKAGE_NAME = "@haus-tech/haus-workflow";

export type NpmVersionStatus = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
};

export async function fetchNpmVersionStatus(currentVersion: string): Promise<NpmVersionStatus> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME)}/latest`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { current: currentVersion, latest: null, updateAvailable: false };
    const data = (await res.json()) as { version?: string };
    const latest = data?.version;
    if (!latest || !normalizeVersion(latest) || !normalizeVersion(currentVersion)) {
      return { current: currentVersion, latest: null, updateAvailable: false };
    }
    const updateAvailable = compareVersions(latest, currentVersion) > 0;
    return { current: currentVersion, latest, updateAvailable };
  } catch {
    return { current: currentVersion, latest: null, updateAvailable: false };
  }
}
