/** `haus refresh` — re-runs a fast project scan and prints the detected roles and package manager. */
import { scanProject } from "../scanner/scan-project.js";
import { log } from "../utils/logger.js";

/** Re-scans the current project in fast mode and logs detected roles and package manager. */
export async function runRefresh(): Promise<void> {
  const result = await scanProject(process.cwd(), "fast");
  log("Haus scan complete");
  log(`Roles: ${result.repoRoles.join(", ") || "unknown"}`);
  log(`Package manager: ${result.packageManager}`);
}
