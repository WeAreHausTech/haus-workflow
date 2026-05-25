import path from "node:path";

import fs from "fs-extra";

import type { Recommendation } from "../types.js";
import { hashInstalledPaths } from "../update/hash-installed.js";
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from "../utils/diff.js";
import { readJson, writeText } from "../utils/fs.js";
import { log, warn } from "../utils/logger.js";
import { claudePath, displayPath, hausPath, packageRoot } from "../utils/paths.js";

import { DEFAULT_HOOKS_CONFIG } from "./load-hooks-config.js";
import { loadClaudeHooksSettings } from "./load-hooks.js";
import { assertPostApplySettingsMatchCanonical } from "./verify-hooks-contract.js";

export async function writeClaudeFiles(root: string, dryRun: boolean): Promise<string[]> {
  const rec = (await readJson<Recommendation>(hausPath(root, "recommendation.json"))) ?? {
    mode: "fast",
    recommended: [],
    skipped: [],
    warnings: [],
    estimatedContextTokens: 0,
    selectedRules: 0,
    skippedRules: 0,
    estimatedTokenReductionPct: 0,
  };
  // Lock and selected-context are only written during actual apply, not dry-run.
  const coreFiles = [
    claudePath(root, "CLAUDE.md"),
    claudePath(root, "settings.json"),
    claudePath(root, "rules", "haus.md"),
    claudePath(root, "rules", "security.md"),
    claudePath(root, "commands", "haus-doctor.md"),
    claudePath(root, "commands", "haus-review.md"),
    claudePath(root, "commands", "haus-explain-context.md"),
  ];
  const files = dryRun
    ? [...coreFiles]
    : [...coreFiles, hausPath(root, "selected-context.json"), hausPath(root, "haus.lock.json")];
  await writeManagedText(
    root,
    claudePath(root, "CLAUDE.md"),
    `# Haus AI

This project uses the Haus AI workflow.

Use \`.haus-ai/context-map.json\`, \`.haus-ai/recommendation.json\`, and \`.haus-ai/repo-summary.md\` before choosing context.

Use:

\`\`\`bash
haus doctor
haus explain-context
haus context --task "<task>"
\`\`\`
`,
    dryRun,
  );
  const hookSettings = await loadClaudeHooksSettings();
  await writeManagedJson(root, claudePath(root, "settings.json"), hookSettings, dryRun);
  if (!dryRun) await assertPostApplySettingsMatchCanonical(root, hookSettings);
  // Emit `.haus-ai/config.json` with the P2 hook gating defaults (both off).
  // Existing config is preserved by writeManagedJson via writeManagedText's
  // unchanged-content short-circuit; new projects get the defaults written.
  const configPath = hausPath(root, "config.json");
  if (!(await fs.pathExists(configPath))) {
    await writeManagedJson(root, configPath, DEFAULT_HOOKS_CONFIG, dryRun);
  }
  await writeManagedText(root, claudePath(root, "commands", "haus-doctor.md"), "Run `haus doctor`.", dryRun);
  await writeManagedText(
    root,
    claudePath(root, "commands", "haus-review.md"),
    'Run `haus context --task "code review"` then review diff.',
    dryRun,
  );
  await writeManagedText(
    root,
    claudePath(root, "commands", "haus-explain-context.md"),
    "Run `haus explain-context`.",
    dryRun,
  );
  await writeManagedText(
    root,
    claudePath(root, "rules", "haus.md"),
    "- Keep context minimal.\n- Follow project conventions.\n",
    dryRun,
  );
  await writeManagedText(
    root,
    claudePath(root, "rules", "security.md"),
    "- Never read secrets.\n- Block dangerous shell commands.\n",
    dryRun,
  );

  const pkgRoot = packageRoot();
  type ManifestItem = {
    id: string;
    path: string;
    type: string;
    source?: string;
    reviewStatus?: string;
    riskLevel?: string;
    originSourceId?: string;
    useMode?: string;
    license?: string;
  };
  const manifest = (await readJson<{ items?: ManifestItem[] }>(
    path.join(pkgRoot, "library", "catalog", "manifest.json"),
  )) ?? { items: [] };
  const manifestById = new Map((manifest.items ?? []).map((item) => [item.id, item]));
  const installedPathsByItem = new Map<string, string[]>();
  // Track which recommended items were actually installed so that skipped
  // curated items (unapproved or blocked) are excluded from the lock and
  // selected-context output — a stale recommendation.json must not cause
  // unapproved artifacts to appear in the written state.
  const installedIds = new Set<string>();

  for (const item of rec.recommended) {
    const manifestItem = manifestById.get(item.id);
    if (!manifestItem?.path) continue;
    // Curated items must be approved and not blocked before they are written to disk.
    if (manifestItem.source === "curated") {
      if (manifestItem.reviewStatus !== "approved") {
        warn(
          `Skipping curated item ${item.id}: reviewStatus is not approved (${manifestItem.reviewStatus ?? "unset"})`,
        );
        continue;
      }
      if (manifestItem.riskLevel === "blocked") {
        warn(`Skipping curated item ${item.id}: riskLevel is blocked`);
        continue;
      }
    }
    const sourcePath = path.join(pkgRoot, manifestItem.path);
    const target = item.type === "agent" ? "agents" : "skills";
    const destination = claudePath(root, target, path.basename(sourcePath));
    if (await fs.pathExists(sourcePath)) {
      if (dryRun) {
        const exists = await fs.pathExists(destination);
        log(`${displayPath(root, destination)}: ${exists ? "would overwrite" : "would create"} (${item.id})`);
      } else {
        await fs.ensureDir(path.dirname(destination));
        await fs.copy(sourcePath, destination, { overwrite: true, errorOnExist: false });
      }
      files.push(destination);
      const current = installedPathsByItem.get(item.id) ?? [];
      installedPathsByItem.set(item.id, [...current, path.relative(root, destination)]);
    }
    installedIds.add(item.id);
  }

  if (dryRun) return [...new Set(files)];

  const installedItems = rec.recommended.filter((r) => installedIds.has(r.id));
  await writeManagedJson(
    root,
    hausPath(root, "selected-context.json"),
    installedItems.map((r) => ({ id: r.id, type: r.type, reason: r.reason, confidenceLevel: r.confidenceLevel })),
    false,
  );
  const hausVersion = (await readJson<{ version?: string }>(path.join(pkgRoot, "package.json")))?.version ?? "0.0.0";
  const lock = await Promise.all(
    installedItems.map(async (r) => {
      const relPaths = installedPathsByItem.get(r.id) ?? [];
      const manifestItem = manifestById.get(r.id);
      const isCurated = manifestItem?.source === "curated";
      const base = {
        id: r.id,
        type: r.type,
        source: isCurated ? "curated" : "haus",
        version: hausVersion,
        hash: await hashInstalledPaths(root, relPaths),
        installMode: "copied",
        paths: relPaths,
      };
      if (!isCurated || !manifestItem) return base;
      // Attach curated provenance fields to lock entry for auditability.
      return {
        ...base,
        ...(manifestItem.originSourceId ? { originSourceId: manifestItem.originSourceId } : {}),
        ...(manifestItem.useMode ? { useMode: manifestItem.useMode } : {}),
        ...(manifestItem.license ? { license: manifestItem.license } : {}),
        ...(manifestItem.riskLevel ? { riskLevel: manifestItem.riskLevel } : {}),
        ...(manifestItem.reviewStatus ? { reviewStatus: manifestItem.reviewStatus } : {}),
      };
    }),
  );
  await writeManagedJson(root, hausPath(root, "haus.lock.json"), lock, false);

  const pluginSrc = path.join(root, "plugin/.claude-plugin/plugin.json");
  if (await fs.pathExists(pluginSrc)) {
    await fs.ensureDir(claudePath(root, "plugin"));
    // TODO(plugin-pack): copy full plugin subtree into project when product requires bundled plugin mirror.
  }
  return [...new Set(files)];
}

async function writeManagedText(root: string, filePath: string, nextText: string, dryRun: boolean): Promise<void> {
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, "utf8") : "";
  const printable = displayPath(root, filePath);
  if (dryRun) {
    if (!prev) {
      log(createUnifiedDiff(printable, "", nextText));
    } else if (hasTextChanged(prev, nextText)) {
      log(createUnifiedDiff(printable, prev, nextText));
    } else {
      log(`${printable}: unchanged`);
    }
    return;
  }
  if (hasTextChanged(prev, nextText) && prev.length > 0) {
    const diffText = createUnifiedDiff(printable, prev, nextText);
    const summary = summarizeDiff(diffText);
    log(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`);
  }
  await writeText(filePath, nextText);
}

async function writeManagedJson(root: string, filePath: string, value: unknown, dryRun: boolean): Promise<void> {
  const nextText = `${JSON.stringify(value, null, 2)}\n`;
  await writeManagedText(root, filePath, nextText, dryRun);
}
