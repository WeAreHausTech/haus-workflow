import path from "node:path";

import fs from "fs-extra";

import { log } from "../utils/logger.js";

import { runSetupProject } from "./setup-project.js";

export async function runInit(options: { fast?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  const hausDir = path.join(root, ".haus-ai");
  const alreadyInit = await fs.pathExists(hausDir);
  if (alreadyInit) {
    log("Haus AI already initialized in this project.");
    log("Run `haus setup-project` to reconfigure.");
    return;
  }
  log("Welcome to Haus AI. Initializing this project for the first time.");
  await runSetupProject(options);
}
