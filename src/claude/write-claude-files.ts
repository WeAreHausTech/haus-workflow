import path from "node:path";
import fs from "fs-extra";
import { readJson, writeText } from "../utils/fs.js";
import { claudePath, displayPath, hausPath, packageRoot } from "../utils/paths.js";
import type { Recommendation } from "../types.js";
import { loadClaudeHooksSettings } from "./load-hooks.js";
import { assertPostApplySettingsMatchCanonical } from "./verify-hooks-contract.js";
import { hashInstalledPaths } from "../update/hash-installed.js";
import { createUnifiedDiff, hasTextChanged, summarizeDiff } from "../utils/diff.js";

export async function writeClaudeFiles(root: string, dryRun: boolean): Promise<string[]> {
  const rec = (await readJson<Recommendation>(hausPath(root, "recommendation.json"))) ?? {
    mode: "fast",
    recommended: [],
    skipped: [],
    warnings: [],
    estimatedContextTokens: 0,
    selectedRules: 0,
    skippedRules: 0,
    estimatedTokenReductionPct: 0
  };
  const files = [
    claudePath(root, "CLAUDE.md"),
    claudePath(root, "settings.json"),
    claudePath(root, "rules", "haus.md"),
    claudePath(root, "rules", "security.md"),
    claudePath(root, "commands", "haus-doctor.md"),
    claudePath(root, "commands", "haus-review.md"),
    claudePath(root, "commands", "haus-explain-context.md"),
    hausPath(root, "selected-context.json"),
    hausPath(root, "haus.lock.json")
  ];
  if (dryRun) return files;

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
`
  );
  const hookSettings = await loadClaudeHooksSettings();
  await writeManagedJson(root, claudePath(root, "settings.json"), hookSettings);
  await assertPostApplySettingsMatchCanonical(root, hookSettings);
  await writeManagedText(root, claudePath(root, "commands", "haus-doctor.md"), "Run `haus doctor`.");
  await writeManagedText(root, claudePath(root, "commands", "haus-review.md"), "Run `haus context --task \"code review\"` then review diff.");
  await writeManagedText(root, claudePath(root, "commands", "haus-explain-context.md"), "Run `haus explain-context`.");
  await writeManagedText(root, claudePath(root, "rules", "haus.md"), "- Keep context minimal.\n- Follow project conventions.\n");
  await writeManagedText(root, claudePath(root, "rules", "security.md"), "- Never read secrets.\n- Block dangerous shell commands.\n");

  const pkgRoot = packageRoot();
  const manifest = (await readJson<{ items?: Array<{ id: string; path: string; type: string }> }>(
    path.join(pkgRoot, "library", "catalog", "manifest.json")
  )) ?? { items: [] };
  const manifestById = new Map((manifest.items ?? []).map((item) => [item.id, item]));
  const installedPathsByItem = new Map<string, string[]>();

  for (const item of rec.recommended) {
    const manifestItem = manifestById.get(item.id);
    if (!manifestItem?.path) continue;
    const sourcePath = path.join(pkgRoot, manifestItem.path);
    const target = item.type === "agent" ? "agents" : "skills";
    const destination = claudePath(root, target, path.basename(sourcePath));
    if (await fs.pathExists(sourcePath)) {
      await fs.ensureDir(path.dirname(destination));
      await fs.copy(sourcePath, destination, { overwrite: true, errorOnExist: false });
      files.push(destination);
      const current = installedPathsByItem.get(item.id) ?? [];
      installedPathsByItem.set(item.id, [...current, path.relative(root, destination)]);
    }
  }
  await writeManagedJson(
    root,
    hausPath(root, "selected-context.json"),
    rec.recommended.map((r) => ({ id: r.id, type: r.type, reason: r.reason, confidenceLevel: r.confidenceLevel }))
  );
  const hausVersion =
    (await readJson<{ version?: string }>(path.join(pkgRoot, "package.json")))?.version ?? "0.0.0";
  const lock = await Promise.all(
    rec.recommended.map(async (r) => {
      const relPaths = installedPathsByItem.get(r.id) ?? [];
      return {
        id: r.id,
        type: r.type,
        source: "haus",
        version: hausVersion,
        hash: await hashInstalledPaths(root, relPaths),
        installMode: "copied",
        paths: relPaths
      };
    })
  );
  await writeManagedJson(root, hausPath(root, "haus.lock.json"), lock);

  const pluginSrc = path.join(root, "plugin/.claude-plugin/plugin.json");
  if (await fs.pathExists(pluginSrc)) {
    await fs.ensureDir(claudePath(root, "plugin"));
    // TODO(plugin-pack): copy full plugin subtree into project when product requires bundled plugin mirror.
  }
  return [...new Set(files)];
}

async function writeManagedText(root: string, filePath: string, nextText: string): Promise<void> {
  const prev = (await fs.pathExists(filePath)) ? await fs.readFile(filePath, "utf8") : "";
  if (hasTextChanged(prev, nextText) && prev.length > 0) {
    const printable = displayPath(root, filePath);
    const diffText = createUnifiedDiff(printable, prev, nextText);
    const summary = summarizeDiff(diffText);
    console.log(`Overwriting ${printable} (diff +${summary.additions} -${summary.deletions})`);
  }
  await writeText(filePath, nextText);
}

async function writeManagedJson(root: string, filePath: string, value: unknown): Promise<void> {
  const nextText = `${JSON.stringify(value, null, 2)}\n`;
  await writeManagedText(root, filePath, nextText);
}
