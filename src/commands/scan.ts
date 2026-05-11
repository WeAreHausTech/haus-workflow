import { scanProject } from "../scanner/scan-project.js";

export async function runScan(options: { json?: boolean; mode?: "guided" | "fast" }): Promise<void> {
  const mode = options.mode ?? "fast";
  const result = await scanProject(process.cwd(), mode);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Haus scan complete");
  console.log(`Roles: ${result.repoRoles.join(", ") || "unknown"}`);
  console.log(`Package manager: ${result.packageManager}`);
}
