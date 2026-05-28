import path from "node:path";

import checkbox from "@inquirer/checkbox";

import { CACHE_DIR } from "../catalog/remote-catalog.js";
import { writeClaudeFiles } from "../claude/write-claude-files.js";
import type { Recommendation } from "../types.js";
import { readJson } from "../utils/fs.js";
import { error, log, warn } from "../utils/logger.js";
import { displayPath, hausPath } from "../utils/paths.js";

async function cacheHasItems(): Promise<boolean> {
  const data = await readJson<{ items?: unknown[] }>(path.join(CACHE_DIR, "manifest.json"));
  return Array.isArray(data?.items) && data.items.length > 0;
}

export async function runApply(options: {
  dryRun?: boolean;
  write?: boolean;
  select?: boolean;
  allowEmptyCache?: boolean;
}): Promise<void> {
  if (!options.dryRun && !options.write) {
    log("Use --dry-run or --write");
    return;
  }
  const root = process.cwd();
  const isDryRun = Boolean(options.dryRun) && !options.write;

  let selectedIds: string[] | undefined;

  if (options.select) {
    if (!process.stdin.isTTY) {
      error("--select requires an interactive terminal (stdin is not a TTY)");
      process.exitCode = 1;
      return;
    }
    const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
    if (!rec) {
      log("No recommendation.json found — run `haus recommend` first. Writing core files only.");
      selectedIds = [];
    } else if (rec.recommended.length === 0) {
      log("Recommendation contains no catalog items. Writing core files only.");
      selectedIds = [];
    } else {
      const items = rec.recommended;
      const choices = items.map((item) => ({
        name: `${item.id}  [${item.confidenceLevel}] — ${item.reason}`,
        value: item.id,
        checked: true,
      }));
      const chosen = await checkbox({
        message: "Select catalog items to apply (space to toggle, enter to confirm):",
        choices,
        pageSize: Math.min(20, items.length + 2),
      });
      selectedIds = chosen as string[];
      log(`Selected ${selectedIds.length} of ${items.length} catalog items.`);
    }
  }

  // Block apply when catalog cache is empty and no fixture override is set,
  // unless the recommendation has no catalog items to install or the user
  // explicitly opts in via --allow-empty-cache. Tests/fixtures set
  // HAUS_FIXTURE_CATALOG and are exempt.
  if (!options.allowEmptyCache && !process.env["HAUS_FIXTURE_CATALOG"]) {
    const rec = await readJson<Recommendation>(hausPath(root, "recommendation.json"));
    const catalogItemCount = selectedIds !== undefined ? selectedIds.length : (rec?.recommended.length ?? 0);
    if (catalogItemCount > 0 && !(await cacheHasItems())) {
      if (isDryRun) {
        warn("Catalog cache is empty — `haus apply --write` will skip catalog items. Run `haus update` first.");
      } else {
        error(
          "Catalog cache is empty — cannot install catalog items. Run `haus update` first, " +
            "or pass --allow-empty-cache to apply core files only.",
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  const files = await writeClaudeFiles(root, isDryRun, selectedIds);
  if (isDryRun) {
    log(`Dry-run complete — ${files.length} file(s) planned, none written. Run --write to apply.`);
  } else {
    log("Applied files:");
    files.forEach((f) => log(`- ${displayPath(root, f)}`));
  }
}
