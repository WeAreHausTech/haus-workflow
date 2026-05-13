import { flattenRecommendedHooks, loadClaudeHooksSettings } from "../claude/load-hooks.js";
import { verifyProjectSettingsHooksContract } from "../claude/verify-hooks-contract.js";
import { writeClaudeFiles } from "../claude/write-claude-files.js";
import { recommend } from "../recommender/recommend.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { scanProject } from "../scanner/scan-project.js";
import { readJson, writeJson } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { displayPath, hausPath } from "../utils/paths.js";
import { ask, confirm } from "../utils/prompts.js";

const GUIDED_QUESTIONS = [
  "What is this project for?",
  "Is it for a client, internal Haus work, or experimentation?",
  "What should Claude help with most?",
  "Is this project connected to other repositories?",
  "Are there parts of the project Claude should avoid touching?",
  "Are there client-specific rules or sensitive areas?",
  "Do you want a minimal, standard, or strict setup?",
];

export async function runSetupProject(options: { guided?: boolean; fast?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  let mode: "guided" | "fast" = options.guided ? "guided" : "fast";
  if (!options.guided && !options.fast && !options.json) {
    log("How do you want to set this project up?");
    log("1. Guided setup - I'll ask a few simple questions, then scan the project.");
    log("2. Fast setup - I'll only scan the project and recommend defaults.");
    const choice = await ask("Choose 1 or 2");
    mode = choice === "1" ? "guided" : "fast";
  }

  if (mode === "guided") {
    const existing = (await readJson<Record<string, string>>(hausPath(root, "setup-answers.json"))) ?? {};
    const merged: Record<string, string> = {};
    for (const question of GUIDED_QUESTIONS) {
      if (options.json) {
        merged[question] = existing[question] ?? "pending-user-answer";
        continue;
      }
      const answer = await ask(question);
      merged[question] = answer || existing[question] || "no-answer";
    }
    await writeJson(hausPath(root, "setup-answers.json"), merged);
  }

  // Scan
  const scanResult = await scanProject(root, mode);
  if (options.json) {
    log(JSON.stringify(scanResult, null, 2));
  } else {
    log("Haus scan complete");
    log(`Roles: ${scanResult.repoRoles.join(", ") || "unknown"}`);
    log(`Package manager: ${scanResult.packageManager}`);
  }

  // Recommend
  const context = await readContextOrScan(root);
  const recommendation = await recommend(root, context);
  await writeJson(hausPath(root, "recommendation.json"), recommendation);
  const hookFallback = process.env.HAUS_HOOKS_FALLBACK === "1";
  const hookSettings = await loadClaudeHooksSettings({ allowEmbeddedFallback: hookFallback });
  await writeJson(hausPath(root, "recommended-hooks.json"), flattenRecommendedHooks(hookSettings));
  await writeJson(hausPath(root, "recommended-rules.json"), [
    { id: "haus.rule.context-minimal", enabled: true },
    { id: "haus.rule.security", enabled: true },
  ]);
  if (options.json) {
    log(JSON.stringify(recommendation, null, 2));
  } else {
    log("Haus recommendation ready");
    log(`Recommended: ${recommendation.recommended.length}`);
    log(`Skipped: ${recommendation.skipped.length}`);
  }

  // Doctor summary
  const hooks = await verifyProjectSettingsHooksContract(root);
  const warningLines = [...new Set([...context.warnings, ...(recommendation.warnings ?? [])])];
  log(`Repo: ${context.repoName}`);
  for (const warning of warningLines) log(`- WARN: ${warning}`);
  if (hooks.skipped) {
    log(`- HOOKS: (skipped) ${hooks.message}`);
  } else if (!hooks.ok) {
    log(`- HOOKS FAIL: ${hooks.message}`);
    process.exitCode = 1;
  } else {
    log(`- HOOKS OK: ${hooks.message}`);
  }

  if (options.json) return;

  const approved = await confirm("Approve and write Claude files now?");
  if (!approved) {
    log("Setup reviewed. No files written.");
    log("Next step: run `haus apply --write` when ready.");
    return;
  }

  // Apply
  const files = await writeClaudeFiles(root, false);
  log("Applied files:");
  files.forEach((f) => log(`- ${displayPath(root, f)}`));

  // Post-apply doctor check
  const hooksAfter = await verifyProjectSettingsHooksContract(root);
  if (hooksAfter.skipped) {
    log(`- HOOKS: (skipped) ${hooksAfter.message}`);
  } else if (!hooksAfter.ok) {
    log(`- HOOKS FAIL: ${hooksAfter.message}`);
    process.exitCode = 1;
  } else {
    log(`- HOOKS OK: ${hooksAfter.message}`);
  }
}
