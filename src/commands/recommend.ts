import { writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { recommend } from "../recommender/recommend.js";

export async function runRecommend(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const result = await recommend(root, context);
  await writeJson(hausPath(root, "recommendation.json"), result);
  await writeJson(hausPath(root, "recommended-hooks.json"), [
    { id: "haus.context-hook", command: "haus context --from-hook" },
    { id: "haus.memory-hook", command: "haus memory inject --from-hook" },
    { id: "haus.guard-file", command: "haus guard file-access --from-hook" },
    { id: "haus.guard-bash", command: "haus guard bash --from-hook" }
  ]);
  await writeJson(hausPath(root, "recommended-rules.json"), [
    { id: "haus.rule.context-minimal", enabled: true },
    { id: "haus.rule.security", enabled: true }
  ]);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Haus recommendation ready");
  console.log(`Recommended: ${result.recommended.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
}
