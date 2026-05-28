/** `haus recommend` — scores catalog items against the scanned context and writes recommendation.json. */
import { flattenRecommendedHooks, loadClaudeHooksSettings } from "../claude/load-hooks.js";
import { recommend } from "../recommender/recommend.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { writeJson } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";

/** Scores catalog items against the scanned context and persists recommendation.json, recommended-hooks.json, and recommended-rules.json. */
export async function runRecommend(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const result = await recommend(root, context);
  await writeJson(hausPath(root, "recommendation.json"), result);
  const hookSettings = await loadClaudeHooksSettings();
  await writeJson(hausPath(root, "recommended-hooks.json"), flattenRecommendedHooks(hookSettings));
  await writeJson(hausPath(root, "recommended-rules.json"), [
    { id: "haus.rule.context-minimal", enabled: true },
    { id: "haus.rule.security", enabled: true },
  ]);
  if (options.json) {
    log(JSON.stringify(result, null, 2));
    return;
  }
  log("Haus recommendation ready");
  log(`Recommended: ${result.recommended.length}`);
  log(`Skipped: ${result.skipped.length}`);
}
