export type CuratedSource = {
  id: string;
  source: string;
  pinnedVersion?: string;
  pinnedHash?: string;
  license?: string;
  policy: "rewrite" | "reference" | "candidate-only";
};
