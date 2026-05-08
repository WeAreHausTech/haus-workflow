import { writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { readContextOrScan } from "../scanner/read-context.js";
import { recommend } from "../recommender/recommend.js";

export async function runRecommend(options: { json?: boolean }): Promise<void> {
  const root = process.cwd();
  const context = await readContextOrScan(root);
  const result = await recommend(root, context);
  await writeJson(hausPath(root, "recommendation.json"), result);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Haus recommendation ready");
  console.log(`Recommended: ${result.recommended.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
}
