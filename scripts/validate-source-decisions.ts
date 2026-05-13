import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";
import { z } from "zod";

import { containsUnsupportedStackMention } from "../src/curation/unsupported-stack-mention.js";

const acceptedIdeaSchema = z.object({
  idea: z.string().min(1),
  target: z.string().min(1),
  reason: z.string().min(1),
  copied: z.literal(false),
  maintenanceRisk: z.enum(["low", "medium", "high"]),
  licenseAttributionConcern: z.enum(["none", "low", "medium", "high"]),
  productFit: z.enum(["strong", "medium", "weak", "reject"]),
});

const rejectedIdeaSchema = z.object({
  idea: z.string().min(1),
  reason: z.string().min(1),
});

const sourceDecisionSchema = z.object({
  source: z.string().min(1),
  ideasAccepted: z.array(acceptedIdeaSchema),
  ideasRejected: z.array(rejectedIdeaSchema),
});

const sourceDecisionsSchema = z.object({
  decisions: z.array(sourceDecisionSchema).min(1),
});

type SourcesYaml = {
  sources?: Array<{ id: string }>;
};

function resolveDecisionsPath(): string {
  const override = process.env.HAUS_SOURCE_DECISIONS_PATH;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "library/curation/source-decisions.json");
}

function resolveSourcesPath(): string {
  const override = process.env.HAUS_SOURCES_PATH;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "library/catalog/sources.yaml");
}

function main(): void {
  const issues: string[] = [];

  const decisionsPath = resolveDecisionsPath();
  const sourcesPath = resolveSourcesPath();

  const decisionsText = fs.readFileSync(decisionsPath, "utf8");
  const parsedJson = JSON.parse(decisionsText);
  const parsed = sourceDecisionsSchema.safeParse(parsedJson);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${decisionsPath}: ${issue.path.join(".")} ${issue.message}`);
    }
  }

  const sourcesText = fs.readFileSync(sourcesPath, "utf8");
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
        issues.push(`${decision.source}: source not present in ${sourcesPath}`);
      }

      for (const idea of decision.ideasAccepted) {
        if (containsUnsupportedStackMention(`${idea.idea} ${idea.target} ${idea.reason}`)) {
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
