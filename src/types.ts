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
  /** When true, recommender applies a baseline score so the item is selected unless policy blocks it. */
  default?: boolean;
};

export type Recommendation = {
  mode: "guided" | "fast";
  recommended: Array<{
    id: string;
    type: string;
    reason: string;
    reasons: Array<{ code: string; message: string; weight: number }>;
    confidence: number;
    confidenceLevel: "low" | "medium" | "high";
    selectionMode: "baseline" | "matched";
    install: boolean;
    score: number;
    scoreBreakdown: {
      bonuses: Array<{ code: string; message: string; weight: number }>;
      penalties: Array<{ code: string; message: string; penalty: number }>;
      finalScore: number;
    };
  }>;
  skipped: Array<{
    id: string;
    reason: string;
    skipReasons: Array<{ code: string; message: string; penalty: number }>;
  }>;
  warnings: string[];
  estimatedContextTokens: number;
  selectedRules: number;
  skippedRules: number;
  estimatedTokenReductionPct: number;
};
