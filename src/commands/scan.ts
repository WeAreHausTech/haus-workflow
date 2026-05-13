import { scanProject } from "../scanner/scan-project.js";
import { log } from "../utils/logger.js";

export async function runScan(options: { json?: boolean; mode?: "guided" | "fast" }): Promise<void> {
  const mode = options.mode ?? "fast";
  const result = await scanProject(process.cwd(), mode);
  if (options.json) {
    log(JSON.stringify(result, null, 2));
    return;
  }
  log("Haus scan complete");
  log(`Roles: ${result.repoRoles.join(", ") || "unknown"}`);
  log(`Package manager: ${result.packageManager}`);
}
