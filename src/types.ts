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

export type RequiresAnyClause =
  | { stack: string }
  | { dependency: string }
  | { packageNamePattern: string }
  | { role: string };

export type CatalogItem = {
  id: string;
  type: "skill" | "agent" | "rule" | "command";
  source: string;
  version: string;
  path: string;
  title?: string;
  tags: string[];
  repoRoles: string[];
  installMode?: "copy-selected" | "plugin-only";
  purpose?: string;
  whenToUse?: string;
  whenNotToUse?: string;
  references?: string[];
  safetyNotes?: string[];
  sourceInfluences?: Array<{ source: string; idea: string }>;
  intents?: string[];
  tokenBudget?: number;
  tokenEstimate: number;
  /** When true, recommender applies a baseline score so the item is selected unless policy blocks it. */
  default?: boolean;
  /** When present and non-empty, at least one clause must match the scanned context, otherwise the rule is skipped with `requires-any-unsatisfied`. */
  requiresAny?: RequiresAnyClause[];
  /** Optional ecosystem family identifier (e.g. `wordpress`, `laravel`, `vendure`, `nextjs`, `nestjs`, `dotnet`, `nx`, `turbo`). Used by recommender for cross-ecosystem conflict detection. */
  ecosystem?: string;
};

export type Recommendation = {
  mode: "guided" | "fast";
  recommended: Array<{
    id: string;
    type: string;
    reason: string;
    reasons: Array<{ code: string; message: string; weight: number; signal?: string }>;
    confidence: number;
    confidenceLevel: "low" | "medium" | "high";
    selectionMode: "baseline" | "matched";
    install: boolean;
    score: number;
    scoreBreakdown: {
      bonuses: Array<{ code: string; message: string; weight: number; signal?: string }>;
      penalties: Array<{ code: string; message: string; penalty: number; signal?: string }>;
      finalScore: number;
    };
    /** Catalog tags echoed for downstream task-intent routing. Additive optional field. */
    tags?: string[];
    /** Catalog ecosystem family echoed for downstream task-intent routing. Additive optional field. */
    ecosystem?: string;
  }>;
  skipped: Array<{
    id: string;
    reason: string;
    skipReasons: Array<{ code: string; message: string; penalty: number; signal?: string }>;
  }>;
  warnings: string[];
  estimatedContextTokens: number;
  selectedRules: number;
  skippedRules: number;
  estimatedTokenReductionPct: number;
};
