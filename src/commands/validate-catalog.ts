import path from "node:path";

import { readAllowedStacks } from "../catalog/allowed-stacks.js";
import type { CatalogItem } from "../types.js";
import { readJson } from "../utils/fs.js";
import { error, log } from "../utils/logger.js";

const FORBIDDEN = [
  "python",
  "django",
  "go",
  "rust",
  "java",
  "spring",
  "kotlin",
  "swift",
  "android",
  "flutter",
  "dart",
  "c++",
  "perl",
  "defi",
  "trading",
];

async function auditForbiddenStacks(items: CatalogItem[]): Promise<string[]> {
  const failures: string[] = [];
  for (const item of items) {
    const text = `${item.id} ${item.tags.join(" ")}`.toLowerCase();
    for (const word of FORBIDDEN) {
      if (text.includes(word)) failures.push(`${item.id}: unsupported stack/tag "${word}"`);
    }
  }
  return failures;
}

async function auditManifestStructure(items: CatalogItem[]): Promise<string[]> {
  const failures: string[] = [];
  const seenIds = new Map<string, number>();
  const seenPaths = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    if (!item.id) {
      failures.push(`item[${i}]: missing id`);
      continue;
    }
    if (!item.type) {
      failures.push(`${item.id}: missing type`);
      continue;
    }
    if (!item.source) {
      failures.push(`${item.id}: missing source`);
    }
    if (!item.title) {
      failures.push(`${item.id}: missing title`);
    }

    const prev = seenIds.get(item.id);
    if (prev !== undefined) {
      failures.push(`${item.id}: duplicate id (first at index ${prev})`);
    } else {
      seenIds.set(item.id, i);
    }

    if (item.type === "skill" || item.type === "agent") {
      if (!item.path) {
        failures.push(`${item.id}: missing path`);
      } else {
        const norm = item.path.replace(/\\/g, "/");
        const existing = seenPaths.get(norm);
        if (existing) {
          failures.push(`${item.id}: path "${norm}" already used by ${existing}`);
        } else {
          seenPaths.set(norm, item.id);
        }
      }

      const isHaus = item.source === "haus";
      const isCuratedApproved = item.source === "curated" && item.reviewStatus === "approved";
      if (!isHaus && !isCuratedApproved) {
        failures.push(`${item.id}: source must be "haus" or curated with reviewStatus "approved"`);
      }

      for (const ref of item.references ?? []) {
        if (/^http:\/\//i.test(ref)) {
          failures.push(`${item.id}: reference uses insecure http:// URL: ${ref}`);
        }
      }
    }
  }
  return failures;
}

/**
 * `haus validate-catalog <manifest-path>`
 *
 * Validates a catalog manifest at an explicit path. Used by catalog repo CI:
 *   haus validate-catalog ./manifest.json
 */
export async function runValidateCatalog(manifestPath: string | undefined): Promise<void> {
  if (!manifestPath) {
    error("Usage: haus validate-catalog <path/to/manifest.json>");
    process.exitCode = 1;
    return;
  }

  const abs = path.resolve(process.cwd(), manifestPath);
  const data = await readJson<{ items: CatalogItem[] }>(abs);
  if (!data?.items) {
    error(`Could not read catalog manifest at ${abs}`);
    process.exitCode = 1;
    return;
  }

  const items = data.items;
  const [structureFailures, stackFailures] = await Promise.all([
    auditManifestStructure(items),
    auditForbiddenStacks(items),
  ]);

  // Also run allowed-stacks check against CLI repo's allowlist if available
  const cliRoot = process.cwd();
  const allowed = new Set((await readAllowedStacks(cliRoot)).map((x) => x.toLowerCase()));
  const tagFailures: string[] = [];
  if (allowed.size > 0) {
    for (const item of items) {
      for (const tag of item.tags) {
        if (
          !allowed.has(tag.toLowerCase()) &&
          !tag.includes("-patterns") &&
          tag !== "haus" &&
          tag !== "security" &&
          tag !== "quality" &&
          tag !== "review" &&
          tag !== "workflow"
        ) {
          tagFailures.push(`${item.id}: tag not in allowlist: "${tag}"`);
        }
      }
    }
  }

  const allFailures = [...structureFailures, ...stackFailures, ...tagFailures];
  if (allFailures.length) {
    allFailures.forEach((f) => error(f));
    process.exitCode = 1;
    return;
  }

  log(`Catalog valid. ${items.length} items checked.`);
}
