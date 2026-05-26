// HAUS-PRERELEASE-CLEANUP: P4a — sources subsystem removed before v0.1.
import { syncGithubSource } from "../sources/github-source.js";
import { loadSources } from "../sources/load-sources.js";
import { syncPrpmSource } from "../sources/prpm-source.js";
import { syncSkillkitSource } from "../sources/skillkit-source.js";
import { syncSkillsShSource } from "../sources/skills-sh-source.js";
import { auditSources } from "../sources/source-audit.js";
import { renderSourceReport } from "../sources/source-report.js";
import { writeText } from "../utils/fs.js";
import { error, log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";

export async function runSources(action: "sync" | "report" | "audit", options: { check?: boolean }): Promise<void> {
  const root = process.cwd();
  if (action === "audit") {
    const issues = await auditSources(root);
    if (issues.length) {
      issues.forEach((x) => error(`- ${x}`));
      process.exitCode = 1;
      return;
    }
    log("Source audit passed.");
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
        notes: "No adapter mapped. Candidate only.",
      });
    }
  }
  const report = renderSourceReport(items);
  await writeText(hausPath(root, "sources-report.json"), report);
  if (action === "report") {
    log(report);
    return;
  }
  log(`Source sync ${checkOnly ? "check" : "report"} generated at .haus-workflow/sources-report.json`);
}
