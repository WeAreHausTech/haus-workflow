import { scanProject } from "../scanner/scan-project.js";

export async function runScan(options: { json?: boolean }): Promise<void> {
  const result = await scanProject(process.cwd(), "fast");
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Haus scan complete");
  console.log(`Roles: ${result.repoRoles.join(", ") || "unknown"}`);
  console.log(`Package manager: ${result.packageManager}`);
}
