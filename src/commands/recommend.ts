import { flattenRecommendedHooks, loadClaudeHooksSettings } from "../claude/load-hooks.js";
import { recommend } from "../recommender/recommend.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";

export async function runRecommend(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const result = await recommend(root, context);
  await writeJson(hausPath(root, "recommendation.json"), result);
  const hookFallback = process.env.HAUS_HOOKS_FALLBACK === "1";
  const hookSettings = await loadClaudeHooksSettings({ allowEmbeddedFallback: hookFallback });
  await writeJson(hausPath(root, "recommended-hooks.json"), flattenRecommendedHooks(hookSettings));
  await writeJson(hausPath(root, "recommended-rules.json"), [
    { id: "haus.rule.context-minimal", enabled: true },
    { id: "haus.rule.security", enabled: true },
  ]);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Haus recommendation ready");
  console.log(`Recommended: ${result.recommended.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
}
