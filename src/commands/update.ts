import path from "node:path";

import { syncRemoteCatalog } from "../catalog/remote-catalog.js";
import { diffGeneratedFiles, summarizeLockDiff } from "../update/diff-generated-files.js";
import { applyLock, checkLock, diffLock, hasLocalOverrides } from "../update/lockfile.js";
import { readJson } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";
import { packageRoot } from "../utils/paths.js";

const NPM_PACKAGE_NAME = "@haus-tech/haus-workflow";

async function checkNpmVersion(currentVersion: string): Promise<void> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME)}/latest`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    const latest = data?.version;
    if (!latest) return;
    if (latest !== currentVersion) {
      log(`npm update available: ${currentVersion} → ${latest}`);
      log(`Run: npm install -g ${NPM_PACKAGE_NAME}`);
    } else {
      log(`npm package up to date: ${currentVersion}`);
    }
  } catch {
    // Network unavailable or package not yet published — skip silently
  }
}

export async function runUpdate(options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (options.check) {
    const status = await checkLock(root);
    log(
      JSON.stringify(
        {
          ...status,
          localOverrides: await hasLocalOverrides(root),
          summary: diffGeneratedFiles(),
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
  await checkNpmVersion(currentVersion);

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
