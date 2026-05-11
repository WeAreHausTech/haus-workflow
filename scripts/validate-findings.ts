import fs from "node:fs";
import path from "node:path";

type Issue = {
  id: string;
  repo: string;
  status: "issue";
  command?: string;
  commands?: string[];
  issue: string;
  expected: string;
  actual?: unknown;
  severity: "low" | "medium" | "high" | "critical";
  rootCauseHypothesis?: string;
  proposedFixPR?: string;
};

type Clean = {
  id: string;
  repo: string;
  status: "clean";
  commands: string[];
  notes: string;
};

type Finding = Issue | Clean;

const dir = path.resolve("tests/fixtures/findings");
const severities = new Set(["low", "medium", "high", "critical"]);

if (!fs.existsSync(dir)) {
  console.error(`findings directory missing: ${dir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .sort();

const issues: string[] = [];
let issueCount = 0;
let cleanCount = 0;

for (const file of files) {
  const full = path.join(dir, file);
  let parsed: Finding;
  try {
    parsed = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (err) {
    issues.push(`${file}: invalid JSON (${(err as Error).message})`);
    continue;
  }

  const ctx = `${file}`;
  if (!parsed.id || typeof parsed.id !== "string") issues.push(`${ctx}: missing id`);
  if (!parsed.repo || typeof parsed.repo !== "string") issues.push(`${ctx}: missing repo`);
  if (parsed.status !== "issue" && parsed.status !== "clean") {
    issues.push(`${ctx}: status must be "issue" or "clean"`);
    continue;
  }

  if (parsed.status === "issue") {
    issueCount += 1;
    if (!parsed.issue) issues.push(`${ctx}: issue record missing "issue"`);
    if (!parsed.expected) issues.push(`${ctx}: issue record missing "expected"`);
    if (!parsed.severity || !severities.has(parsed.severity)) {
      issues.push(`${ctx}: severity must be one of ${[...severities].join("|")}`);
    }
    const hasCommand =
      (typeof parsed.command === "string" && parsed.command.length > 0) ||
      (Array.isArray(parsed.commands) && parsed.commands.length > 0);
    if (!hasCommand) issues.push(`${ctx}: issue record needs "command" or non-empty "commands"`);
  } else {
    cleanCount += 1;
    if (!Array.isArray(parsed.commands) || parsed.commands.length === 0) {
      issues.push(`${ctx}: clean record needs non-empty "commands" array`);
    }
    if (!parsed.notes || typeof parsed.notes !== "string") {
      issues.push(`${ctx}: clean record needs "notes" string`);
    }
  }
}

console.log(`Scanned ${files.length} finding files (${issueCount} issue, ${cleanCount} clean).`);

if (issues.length > 0) {
  console.error("Schema problems:");
  for (const i of issues) console.error(`- ${i}`);
  process.exit(1);
}

console.log("Findings schema OK.");
