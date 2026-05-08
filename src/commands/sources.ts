import { writeText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { syncGithubSource } from "../sources/github-source.js";
import { syncPrpmSource } from "../sources/prpm-source.js";
import { syncSkillsShSource } from "../sources/skills-sh-source.js";
import { syncSkillkitSource } from "../sources/skillkit-source.js";
import { renderSourceReport } from "../sources/source-report.js";

export async function runSources(action: "sync" | "report" | "audit", options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (action === "audit") {
    console.log("Source audit: use scripts/audit-sources.ts");
    return;
  }
  const items = [
    await syncGithubSource(Boolean(options.check)),
    await syncSkillsShSource(),
    await syncPrpmSource(),
    await syncSkillkitSource()
  ].map((x) => ({ source: x.source, status: "candidate" as const, notes: x.message }));
  const report = renderSourceReport(items);
  await writeText(hausPath(root, "sources-report.json"), report);
  if (action === "report") {
    console.log(report);
    return;
  }
  console.log("Source sync check report generated at .haus-ai/sources-report.json");
}
