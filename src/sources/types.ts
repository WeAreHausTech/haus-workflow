export type SourcePolicy = "rewrite" | "reference" | "candidate-only";

export type SourceStatus = "candidate" | "approved" | "rejected";

export type CuratedSource = {
  id: string;
  url: string;
  policy: SourcePolicy;
  status: SourceStatus;
  pinnedVersion?: string;
  pinnedHash?: string;
  license?: string;
  notes?: string;
  containsStacks?: string[];
  unsafeHookCommands?: string[];
};

export type SourceSyncItem = {
  id: string;
  source: string;
  status: SourceStatus;
  policy: SourcePolicy;
  checkOnly: boolean;
  pinned: boolean;
  notes: string;
};
