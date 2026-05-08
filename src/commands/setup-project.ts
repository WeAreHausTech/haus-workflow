import { readJson, writeJson } from "../utils/fs.js";
import { hausPath } from "../utils/paths.js";
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
  "Do you want a minimal, standard, or strict setup?"
];

export async function runSetupProject(options: { guided?: boolean; fast?: boolean; json?: boolean }): Promise<void> {
  const root = process.cwd();
  const mode = options.guided ? "guided" : "fast";
  if (mode === "guided") {
    const existing = (await readJson<Record<string, string>>(hausPath(root, "setup-answers.json"))) ?? {};
    const merged = Object.fromEntries(GUIDED_QUESTIONS.map((q) => [q, existing[q] ?? "pending-user-answer"]));
    await writeJson(hausPath(root, "setup-answers.json"), merged);
  }
  await runScan({ json: true });
  await runRecommend({ json: true });
  await runDoctor();
  if (!options.json) {
    console.log('How do you want to set this project up?');
    console.log("1. Guided setup - questions + scan");
    console.log("2. Fast setup - scan only");
    console.log("Run: haus apply --write after approval.");
  }
}
