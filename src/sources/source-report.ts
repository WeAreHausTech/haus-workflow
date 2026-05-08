export type SourceReport = {
  source: string;
  status: "candidate" | "approved" | "rejected";
  notes: string;
};

export function renderSourceReport(items: SourceReport[]): string {
  return JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2);
}
