export type PackageManager = "yarn" | "pnpm" | "npm" | "unknown";

export type ContextMap = {
  mode: "guided" | "fast";
  generatedAt: string;
  root: string;
  repoName: string;
  packageManager: PackageManager;
  repoRoles: string[];
  confidence: number;
  detectedStacks: Record<string, string[]>;
  dependencies: string[];
  securityRisks: string[];
  crossRepoHints: string[];
  warnings: string[];
};

export type CatalogItem = {
  id: string;
  type: "skill" | "agent" | "rule" | "command";
  source: string;
  version: string;
  path: string;
  tags: string[];
  repoRoles: string[];
  tokenEstimate: number;
};

export type Recommendation = {
  mode: "guided" | "fast";
  recommended: Array<{ id: string; type: string; reason: string; confidence: number; install: boolean }>;
  skipped: Array<{ id: string; reason: string }>;
  warnings: string[];
  estimatedContextTokens: number;
};
