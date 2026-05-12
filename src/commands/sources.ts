import { writeText } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
import { syncGithubSource } from "../sources/github-source.js";
import { syncPrpmSource } from "../sources/prpm-source.js";
import { syncSkillsShSource } from "../sources/skills-sh-source.js";
import { syncSkillkitSource } from "../sources/skillkit-source.js";
import { renderSourceReport } from "../sources/source-report.js";
import { loadSources } from "../sources/load-sources.js";
import { auditSources } from "../sources/source-audit.js";

export async function runSources(action: "sync" | "report" | "audit", options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (action === "audit") {
    const issues = await auditSources(root);
    if (issues.length) {
      issues.forEach((x) => console.error(`- ${x}`));
      process.exitCode = 1;
      return;
    }
    console.log("Source audit passed.");
    return;
  }
  const checkOnly = Boolean(options.check);
  const sources = await loadSources(root);
  const items = [];
  for (const source of sources) {
    if (source.url.includes("github.com")) items.push(await syncGithubSource(source, checkOnly));
    else if (source.url.includes("skills.sh")) items.push(await syncSkillsShSource(source, checkOnly));
    else if (source.url.includes("prpm.dev")) items.push(await syncPrpmSource(source, checkOnly));
    else if (source.url.includes("skillkit.dev")) items.push(await syncSkillkitSource(source, checkOnly));
    else {
      items.push({
        id: source.id,
        source: source.url,
        status: source.status,
        policy: source.policy,
        checkOnly,
        pinned: Boolean(source.pinnedVersion && source.pinnedHash),
        notes: "No adapter mapped. Candidate only."
      });
    }
  }
  const report = renderSourceReport(items);
  await writeText(hausPath(root, "sources-report.json"), report);
  if (action === "report") {
    console.log(report);
    return;
  }
  console.log(`Source sync ${checkOnly ? "check" : "report"} generated at .haus-ai/sources-report.json`);
}
