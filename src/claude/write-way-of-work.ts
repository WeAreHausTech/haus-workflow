import os from "node:os";
import path from "node:path";

import fs from "fs-extra";

import { CATALOG_CACHE_SUBDIR } from "../catalog/constants.js";
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from "../utils/diff.js";
import { hashText, writeText } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";
import { displayPath, hausPath, packageRoot } from "../utils/paths.js";

const STABLE_ID = "template.way-of-work";
const SCHEMA_VERSION = "1";
const TEMPLATE_REL = "library/global/templates/haus-way-of-work.md";
const CATALOG_CACHE_TEMPLATE = path.join(os.homedir(), CATALOG_CACHE_SUBDIR, "templates/haus-way-of-work.md");

export function makeWayOfWorkHeader(pkgVersion: string, contentHash: string): string {
  return `<!-- HAUS-MANAGED id=${STABLE_ID} v=${SCHEMA_VERSION} source=@haus-tech/haus-workflow@${pkgVersion} hash=${contentHash} -->`;
}

function parseHausManagedHeader(line: string): { id: string; hash?: string } | null {
  const match = line.match(/<!-- HAUS-MANAGED id=([\w.:-]+)/);
  if (!match) return null;
  const hashMatch = line.match(/hash=(sha256-[a-f0-9]+)/);
  return { id: match[1], hash: hashMatch?.[1] };
}

export async function writeWayOfWork(root: string, pkgVersion: string, dryRun: boolean): Promise<string | null> {
  // Catalog cache (populated by `haus update`) takes precedence over bundled fallback
  const cachePath = CATALOG_CACHE_TEMPLATE;
  const packagePath = path.join(packageRoot(), TEMPLATE_REL);
  const templatePath = (await fs.pathExists(cachePath)) ? cachePath : packagePath;

  if (!(await fs.pathExists(templatePath))) {
    warn(`Way-of-work template not found — run \`haus update\` to fetch from catalog`);
    return null;
  }

  const templateContent = await fs.readFile(templatePath, "utf8");
  const contentHash = hashText(templateContent);
  const header = makeWayOfWorkHeader(pkgVersion, contentHash);
  const next = `${header}\n${templateContent}`;

  const destPath = hausPath(root, "haus-way-of-work.md");
  const printable = displayPath(root, destPath);

  if (await fs.pathExists(destPath)) {
    const existing = await fs.readFile(destPath, "utf8");
    const firstLine = existing.split("\n")[0] ?? "";
    const parsed = parseHausManagedHeader(firstLine);

    if (!parsed) {
      warn(`${printable}: no HAUS-MANAGED header — file appears user-owned, skipping`);
      return null;
    }

    if (parsed.id !== STABLE_ID) {
      warn(`${printable}: HAUS-MANAGED id mismatch (expected ${STABLE_ID}) — skipping`);
      return null;
    }

    const existingContent = existing.slice(firstLine.length + 1);
    if (parsed.hash && hashText(existingContent) !== parsed.hash) {
      warn(`${printable}: content modified by user — skipping. Use --force to overwrite.`);
      return null;
    }

    if (!hasTextChanged(existing, next)) {
      if (dryRun) log(`${printable}: unchanged`);
      return destPath;
    }
  }

  if (dryRun) {
    const prev = (await fs.pathExists(destPath)) ? await fs.readFile(destPath, "utf8") : "";
    if (!prev) {
      log(createUnifiedDiff(printable, "", next));
    } else {
      const diffText = createUnifiedDiff(printable, prev, next);
      const summary = summarizeDiff(diffText);
      log(`${printable}: would update (diff +${summary.additions} -${summary.deletions})`);
    }
    return destPath;
  }

  await writeText(destPath, next);
  return destPath;
}
