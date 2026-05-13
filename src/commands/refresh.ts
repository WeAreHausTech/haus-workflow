import { scanProject } from "../scanner/scan-project.js";
import { log } from "../utils/logger.js";

export async function runRefresh(): Promise<void> {
  const result = await scanProject(process.cwd(), "fast");
  log("Haus scan complete");
  log(`Roles: ${result.repoRoles.join(", ") || "unknown"}`);
  log(`Package manager: ${result.packageManager}`);
}
