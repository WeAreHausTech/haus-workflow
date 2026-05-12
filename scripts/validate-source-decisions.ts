import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

const DECISIONS_FILE = "library/curation/source-decisions.json";
const SOURCES_FILE = "library/catalog/sources.yaml";

const unsupportedWords = [
  "python",
  "django",
  "go",
  "rust",
  "java",
  "spring",
  "kotlin",
  "swift",
  "android",
  "flutter",
  "dart",
  "c++",
  "trading",
  "healthcare"
];

const acceptedIdeaSchema = z.object({
  idea: z.string().min(1),
  target: z.string().min(1),
  reason: z.string().min(1),
  copied: z.literal(false),
  maintenanceRisk: z.enum(["low", "medium", "high"]),
  licenseAttributionConcern: z.enum(["none", "low", "medium", "high"]),
  productFit: z.enum(["strong", "medium", "weak", "reject"])
});

const rejectedIdeaSchema = z.object({
  idea: z.string().min(1),
  reason: z.string().min(1)
});

const sourceDecisionSchema = z.object({
  source: z.string().min(1),
  ideasAccepted: z.array(acceptedIdeaSchema),
  ideasRejected: z.array(rejectedIdeaSchema)
});

const sourceDecisionsSchema = z.object({
  decisions: z.array(sourceDecisionSchema).min(1)
});

type SourcesYaml = {
  sources?: Array<{ id: string }>;
};

function hasUnsupportedWord(input: string): boolean {
  const lowered = input.toLowerCase();
  return unsupportedWords.some((word) => lowered.includes(word));
}

function main(): void {
  const issues: string[] = [];

  const decisionsText = fs.readFileSync(DECISIONS_FILE, "utf8");
  const parsedJson = JSON.parse(decisionsText);
  const parsed = sourceDecisionsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${DECISIONS_FILE}: ${issue.path.join(".")} ${issue.message}`);
    }
  }

  const sourcesText = fs.readFileSync(SOURCES_FILE, "utf8");
  const sourcesParsed = YAML.parse(sourcesText) as SourcesYaml;
  const sourceIds = new Set((sourcesParsed.sources ?? []).map((s) => s.id));

  if (parsed.success) {
    const seen = new Set<string>();
    for (const decision of parsed.data.decisions) {
      if (seen.has(decision.source)) {
        issues.push(`${decision.source}: duplicate source decision block`);
      }
      seen.add(decision.source);

      if (!sourceIds.has(decision.source)) {
        issues.push(`${decision.source}: source not present in ${SOURCES_FILE}`);
      }

      for (const idea of decision.ideasAccepted) {
        if (hasUnsupportedWord(`${idea.idea} ${idea.target} ${idea.reason}`)) {
          issues.push(`${decision.source}: accepted idea includes unsupported stack signal -> ${idea.idea}`);
        }
      }
      for (const idea of decision.ideasRejected) {
        if (idea.reason.trim().length < 8) {
          issues.push(`${decision.source}: rejected idea reason too short -> ${idea.idea}`);
        }
      }
    }

    for (const id of sourceIds) {
      if (!seen.has(id)) {
        issues.push(`${id}: missing source decision block`);
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Source decisions validation passed.");
}

main();
