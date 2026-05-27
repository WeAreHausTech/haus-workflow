import path from "node:path";

import { fetchLatestCatalogTag, syncRemoteCatalog } from "../catalog/remote-catalog.js";
import { diffGeneratedFiles, summarizeLockDiff } from "../update/diff-generated-files.js";
import { applyLock, checkLock, diffLock, hasLocalOverrides } from "../update/lockfile.js";
import { fetchNpmVersionStatus } from "../update/npm-version.js";
import { readJson } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";
import { packageRoot } from "../utils/paths.js";

const NPM_PACKAGE_NAME = "@haus-tech/haus-workflow";

export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (options.check) {
    const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), "package.json"));
    const currentVersion = pkgJson?.version ?? "0.0.0";
    const [status, npmVersion, latestCatalogTag] = await Promise.all([
      checkLock(root),
      fetchNpmVersionStatus(currentVersion),
      fetchLatestCatalogTag(),
    ]);
    const installedRef = status.catalogRef ?? "main";
    const catalogRefBehind =
      latestCatalogTag !== null && installedRef !== latestCatalogTag
        ? `installed from ${installedRef}, latest tag is ${latestCatalogTag}`
        : false;
    log(
      JSON.stringify(
        {
          ...status,
          installedCatalogRef: installedRef,
          latestCatalogTag,
          catalogRefBehind,
          localOverrides: await hasLocalOverrides(root),
          summary: diffGeneratedFiles(),
          npmVersion,
        },
        null,
        2,
      ),
    );
    if (!status.ok) process.exitCode = 1;
    return;
  }

  const pkgJson = await readJson<{ version?: string }>(path.join(packageRoot(), "package.json"));
  const currentVersion = pkgJson?.version ?? "0.0.0";
  const npmStatus = await fetchNpmVersionStatus(currentVersion);
  if (npmStatus.updateAvailable && npmStatus.latest !== null) {
    log(`npm update available: ${currentVersion} → ${npmStatus.latest}`);
    log(`Run: npm install -g ${NPM_PACKAGE_NAME}`);
  } else if (npmStatus.latest !== null) {
    log(`npm package up to date: ${currentVersion}`);
  }

  if (await hasLocalOverrides(root)) {
    log("Local .claude overrides detected. Preserving local files; only lockfile updated.");
  }
  const { before, after } = await applyLock(root);
  log(diffLock(before, after));
  log(summarizeLockDiff(before, after));

  log("Syncing remote catalog...");
  const sync = await syncRemoteCatalog();
  if (sync.newItems.length > 0) {
    log(`Catalog updated: ${sync.newItems.length} new item(s): ${sync.newItems.join(", ")}`);
    log("Run `haus recommend && haus apply --write` to install new skills.");
  } else if (sync.unchanged > 0) {
    log(`Catalog up to date (${sync.unchanged} item(s) unchanged).`);
  }
  if (sync.failed.length > 0) {
    warn(`Failed to fetch ${sync.failed.length} item(s): ${sync.failed.join(", ")}`);
  }

  log("Update applied with backup in .haus-workflow/backups/. Run haus doctor.");
}
