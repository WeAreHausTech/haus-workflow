import semver from "semver";

export function normalizeVersion(version: string): string | null {
  return semver.valid(semver.coerce(version));
}

export function satisfiesVersion(version: string, range: string): boolean {
  const normalized = normalizeVersion(version);
  if (!normalized) return false;
  return semver.satisfies(normalized, range, { includePrerelease: true });
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const normalizedA = normalizeVersion(a);
  const normalizedB = normalizeVersion(b);
  if (!normalizedA || !normalizedB) {
    throw new Error(`Cannot compare invalid versions: ${a} vs ${b}`);
  }
  return semver.compare(normalizedA, normalizedB) as -1 | 0 | 1;
}

export function assertVersionSatisfies(name: string, version: string, range: string): void {
  if (!satisfiesVersion(version, range)) {
    throw new Error(`${name} version ${version} does not satisfy required range ${range}`);
  }
}
