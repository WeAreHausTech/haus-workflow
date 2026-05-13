import { readJson, writeJson } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { hausPath } from "../utils/paths.js";
import { ask, confirm } from "../utils/prompts.js";

import { runApply } from "./apply.js";
import { runDoctor } from "./doctor.js";
import { runRecommend } from "./recommend.js";
import { runScan } from "./scan.js";

const GUIDED_QUESTIONS = [
  "What is this project for?",
  "Is it for a client, internal Haus work, or experimentation?",
  "What should Claude help with most?",
  "Is this project connected to other repositories?",
  "Are there parts of the project Claude should avoid touching?",
  "Are there client-specific rules or sensitive areas?",
  "Do you want a minimal, standard, or strict setup?",
];

export async function runSetupProject(options: { guided?: boolean; fast?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  let mode: "guided" | "fast" = options.guided ? "guided" : "fast";
  if (!options.guided && !options.fast && !options.json) {
    log("How do you want to set this project up?");
    log("1. Guided setup - I'll ask a few simple questions, then scan the project.");
    log("2. Fast setup - I'll only scan the project and recommend defaults.");
    const choice = await ask("Choose 1 or 2");
    mode = choice === "1" ? "guided" : "fast";
  }

  if (mode === "guided") {
    const existing = (await readJson<Record<string, string>>(hausPath(root, "setup-answers.json"))) ?? {};
    const merged: Record<string, string> = {};
    for (const question of GUIDED_QUESTIONS) {
      if (options.json) {
        merged[question] = existing[question] ?? "pending-user-answer";
        continue;
      }
      const answer = await ask(question);
      merged[question] = answer || existing[question] || "no-answer";
    }
    await writeJson(hausPath(root, "setup-answers.json"), merged);
  }

  const emitJson = options.json === true;
  await runScan({ json: emitJson, mode });
  await runRecommend({ json: emitJson });
  await runDoctor();
  if (options.json) return;
  const approved = await confirm("Approve and write Claude files now?");
  if (!approved) {
    log("Setup reviewed. No files written.");
    log("Next step: run `haus apply --write` when ready.");
    return;
  }
  await runApply({ write: true });
  await runDoctor();
}
