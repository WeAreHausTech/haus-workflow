import { writeText } from "../utils/fs.js";

export async function runWorkspace(action: "init" | "scan"): Promise<void> {
  if (action === "init") {
    await writeText(
      "haus.workspace.yaml",
      `client: unknown\nrepos:\n  - name: current\n    path: .\n    role: auto\nrelationships: []\n`
    );
    console.log("Workspace initialized.");
    return;
  }
  console.log("Workspace scan: run `haus scan` in each repo. Aggregation TODO.");
}
